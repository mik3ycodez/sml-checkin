// The time budget: one overall deadline per check-in, so the whole thing stays
// under the 30 second route limit however slowly TidyHQ answers. No real
// waiting: the clock is faked, and a "slow" call moves it forward.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHECKIN_BUDGET_MS,
  MIN_ATTEMPT_MS,
  NOTE_RESERVE_MS,
} from "../tidyhq/budget";
import type { TidyClient } from "../tidyhq/client";
import { POINTS_FIELD_ID, readPoints } from "../tidyhq/customFields";
import { createFakeTidyServer } from "../tidyhq/http/fakeTidyServer";
import { HttpTidyClient } from "../tidyhq/http/HttpTidyClient";
import { MockTidyClient } from "../tidyhq/mock/MockTidyClient";
import { createSeed, MOCK_COLORS_GROUP_ID } from "../tidyhq/mock/seed";
import { CheckInFailure, checkIn } from "./checkIn";

const NOW = new Date("2026-10-12T18:00:00Z");
const COLORS = { id: MOCK_COLORS_GROUP_ID };
const STAFF = {
  contactId: "c_casey",
  name: "Casey Moreno",
  role: "admin" as const,
};
const SELF = {
  eventId: "ev_tonight",
  contactId: "c_dante",
  now: NOW,
  colorsGroup: COLORS,
} as const;
const AS_STAFF = { ...SELF, method: "staff", staff: STAFF } as const;

let errors: string[];
beforeEach(() => {
  vi.useFakeTimers();
  errors = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(
      args
        .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
        .join(" "),
    );
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Dante, one point short of the club colors, so the next point qualifies. */
function danteAt17() {
  const seed = createSeed(NOW);
  seed.contacts.find((c) => c.id === "c_dante")!.custom_fields[
    POINTS_FIELD_ID
  ] = { id: POINTS_FIELD_ID, title: "Points", type: "string", value: "17" };
  return new MockTidyClient(seed, () => NOW);
}

/**
 * The client, recording every call as "method:firstArg", and moving the fake
 * clock forward by `takes` ms for each call: a number per method, or a
 * function of the method and its first argument.
 */
type Takes =
  | Partial<Record<keyof TidyClient, number>>
  | ((method: string, firstArg: unknown) => number);
function timed(client: MockTidyClient, takes: Takes) {
  const calls: string[] = [];
  const proxy = new Proxy(client, {
    get(target, prop) {
      const value = Reflect.get(target, prop) as unknown;
      if (typeof value !== "function") return value;
      return async (...args: unknown[]) => {
        calls.push(`${String(prop)}:${String(args[0])}`);
        const result = await (value as (...a: unknown[]) => unknown).apply(
          target,
          args,
        );
        vi.advanceTimersByTime(
          typeof takes === "function"
            ? takes(String(prop), args[0])
            : (takes[prop as keyof TidyClient] ?? 0),
        );
        return result;
      };
    },
  }) as TidyClient;
  return { client: proxy, calls };
}

const touchedColors = (calls: string[]) =>
  calls.filter((c) => c.endsWith(`:${MOCK_COLORS_GROUP_ID}`));
const skippedColors = () =>
  errors.filter((e) => e.includes("colors group not updated"));

describe("colors add when the budget runs out after the points write", () => {
  it("is skipped and logged, and the check-in still counts (self)", async () => {
    const mock = danteAt17();
    const { client, calls } = timed(mock, {
      updateContact: CHECKIN_BUDGET_MS - MIN_ATTEMPT_MS + 1,
    });

    const result = await checkIn(client, SELF);

    expect(result).toMatchObject({ status: "checked_in", total: 18 });
    expect(touchedColors(calls)).toEqual([]);
    expect(skippedColors()).toHaveLength(1);
    expect(skippedColors()[0]).toContain("c_dante");
    expect(skippedColors()[0]).toContain("budget_exhausted");
    // Self-healing: not in the group now, and nothing else was changed.
    expect(
      (await mock.listGroupContacts(MOCK_COLORS_GROUP_ID)).map((c) => c.id),
    ).toEqual([]);
  });

  it("may miss the add but can never double-award: the next tap awards nothing", async () => {
    const mock = danteAt17();
    const slow = timed(mock, {
      updateContact: CHECKIN_BUDGET_MS - MIN_ATTEMPT_MS + 1,
    });
    await checkIn(slow.client, SELF);

    const again = await checkIn(mock, SELF);
    expect(again).toMatchObject({ status: "already_checked_in", total: 18 });
    expect(readPoints(await mock.getContact("c_dante"))).toBe(18);
  });

  it("is skipped when the colors read itself uses up the time", async () => {
    const mock = danteAt17();
    const { client, calls } = timed(mock, (method, arg) =>
      method === "listGroupContacts" && arg === MOCK_COLORS_GROUP_ID
        ? CHECKIN_BUDGET_MS
        : 0,
    );

    const result = await checkIn(client, SELF);

    expect(result).toMatchObject({ status: "checked_in", total: 18 });
    expect(calls).toContain(`listGroupContacts:${MOCK_COLORS_GROUP_ID}`);
    expect(calls).not.toContain(`addContactToGroup:${MOCK_COLORS_GROUP_ID}`);
    expect(skippedColors()[0]).toContain("budget_exhausted");
  });

  it("still adds when there is time (the budget changes nothing normally)", async () => {
    const mock = danteAt17();
    const { client, calls } = timed(mock, {});
    await checkIn(client, SELF);
    expect(calls).toContain(`addContactToGroup:${MOCK_COLORS_GROUP_ID}`);
    expect(skippedColors()).toEqual([]);
  });
});

describe("the staff note when the budget runs out", () => {
  const spend = (leaving: number) => ({
    updateContact: CHECKIN_BUDGET_MS - leaving,
  });

  it("is kept safe from the colors add: colors give way, the note is still written, last", async () => {
    const mock = danteAt17();
    const { client, calls } = timed(mock, spend(NOTE_RESERVE_MS + 100));

    const result = await checkIn(client, AS_STAFF);

    expect(result).toMatchObject({ status: "checked_in", total: 18 });
    expect(touchedColors(calls)).toEqual([]);
    expect(skippedColors()[0]).toContain("budget_exhausted");
    expect(calls.at(-1)).toBe("addNote:c_dante");
    expect(errors.filter((e) => e.includes("note"))).toEqual([]);
  });

  it("protects the note even when the colors read is slow", async () => {
    const mock = danteAt17();
    // 8 s remain for the colors steps once the note's share is held back; the
    // colors read takes 9 s of them, so the add is skipped, and the note's
    // share (3 s of the budget's own time) is still there for the note.
    const { client, calls } = timed(mock, (method, arg) => {
      if (method === "updateContact") {
        return CHECKIN_BUDGET_MS - (NOTE_RESERVE_MS + 8_000);
      }
      return method === "listGroupContacts" && arg === MOCK_COLORS_GROUP_ID
        ? 9_000
        : 0;
    });

    await checkIn(client, AS_STAFF);

    expect(calls).toContain(`listGroupContacts:${MOCK_COLORS_GROUP_ID}`);
    expect(calls).not.toContain(`addContactToGroup:${MOCK_COLORS_GROUP_ID}`);
    expect(skippedColors()[0]).toContain("budget_exhausted");
    expect(calls.at(-1)).toBe("addNote:c_dante");
  });

  it("is skipped and logged when nothing is left, and the check-in still counts", async () => {
    const mock = danteAt17();
    const { client, calls } = timed(mock, spend(MIN_ATTEMPT_MS - 1));

    const result = await checkIn(client, AS_STAFF);

    expect(result).toMatchObject({ status: "checked_in", total: 18 });
    expect(calls.some((c) => c.startsWith("addNote"))).toBe(false);
    const noted = errors.filter((e) => e.includes("staff check-in note"));
    expect(noted).toHaveLength(1);
    expect(noted[0]).toContain("c_dante");
    expect(noted[0]).toContain("budget_exhausted");
    // The note's text (who, and when) is never logged.
    expect(noted[0]).not.toContain("Casey");
    expect(skippedColors()[0]).toContain("budget_exhausted");
  });

  it("is not needed for a self check-in, which may use all the time for colors", async () => {
    const mock = danteAt17();
    const { client, calls } = timed(mock, spend(NOTE_RESERVE_MS - 1_000));
    await checkIn(client, SELF);
    expect(calls).toContain(`addContactToGroup:${MOCK_COLORS_GROUP_ID}`);
  });
});

describe("a slow TidyHQ", () => {
  it("fails cleanly with a TidyHQ failure well before the route limit", async () => {
    const mock = new MockTidyClient(createSeed(NOW), () => NOW);
    const server = createFakeTidyServer(mock);
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const started = Date.now();
    const REPLY_MS = 7_000;
    // Every reply takes 7 s: fine for the 8 s request timeout, but a few of
    // them in a row add up to more than the whole route is allowed.
    const slowFetch = (async (...args: Parameters<typeof fetch>) => {
      const cap = timeoutSpy.mock.lastCall?.[0] ?? 8_000;
      if (REPLY_MS >= cap) {
        vi.advanceTimersByTime(cap);
        throw new DOMException("timed out", "TimeoutError");
      }
      vi.advanceTimersByTime(REPLY_MS);
      return server.fetch(...args);
    }) as typeof fetch;
    const http = new HttpTidyClient({
      adminToken: "fake-admin-token",
      fetch: slowFetch,
      sleep: async () => {},
    });
    const live = new Proxy(http, {
      get(target, prop) {
        if (prop === "getEvent") {
          return async (id: string) => ({
            ...(await target.getEvent(id)),
            attendance_group_id: "grp_social_night",
          });
        }
        const value = Reflect.get(target, prop) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as TidyClient;

    const error = await checkIn(live, SELF).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CheckInFailure);
    expect((error as CheckInFailure).step).toBe("lookup");
    expect((error as CheckInFailure).cause.status).toBe(504);
    expect(Date.now() - started).toBeLessThanOrEqual(CHECKIN_BUDGET_MS);
    expect(Date.now() - started).toBeLessThan(30_000);
  });
});
