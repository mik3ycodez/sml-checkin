// The time budget: one overall deadline per check-in, so the whole thing stays
// under the 30 second route limit however slowly TidyHQ answers. No real
// waiting: the clock is faked, and a "slow" call moves it forward.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHECKIN_BUDGET_MS,
  CRITICAL_WRITES_MS,
  MIN_ATTEMPT_MS,
  REQUEST_TIMEOUT_MS,
} from "../tidyhq/budget";
import type { TidyClient } from "../tidyhq/client";
import { POINTS_FIELD_ID, readPoints } from "../tidyhq/customFields";
import { createFakeTidyServer } from "../tidyhq/http/fakeTidyServer";
import { HttpTidyClient } from "../tidyhq/http/HttpTidyClient";
import { MockTidyClient } from "../tidyhq/mock/MockTidyClient";
import { createSeed } from "../tidyhq/mock/seed";
import { CheckInFailure, checkIn } from "./checkIn";

const NOW = new Date("2026-10-12T18:00:00Z");
const STAFF = {
  contactId: "c_casey",
  name: "Casey Moreno",
  role: "admin" as const,
};
const SELF = {
  eventId: "ev_tonight",
  contactId: "c_dante",
  now: NOW,
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

/** Dante, at 17 points. */
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

describe("the two critical writes (group add and points)", () => {
  // Each is given its full timeout or not started, so a write that reaches
  // TidyHQ is never aborted on our side and reported as failed. So before the
  // group add, there must be room for both.
  const readsTake = (ms: number) => ({ getMemberships: ms });

  it("are not started if both can't get their full timeout: nothing is written, and it's safe to retry", async () => {
    const mock = danteAt17();
    const { client, calls } = timed(
      mock,
      readsTake(CHECKIN_BUDGET_MS - CRITICAL_WRITES_MS + 1),
    );

    const error = await checkIn(client, SELF).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CheckInFailure);
    expect((error as CheckInFailure).step).toBe("group_add");
    expect((error as CheckInFailure).cause.status).toBe(504);
    expect(calls.some((c) => c.startsWith("addContactToGroup"))).toBe(false);
    expect(calls.some((c) => c.startsWith("updateContact"))).toBe(false);
    // Nothing changed, so the retry is a normal first check-in.
    expect(await mock.listGroupContacts("grp_social_night")).toEqual([]);
    expect(readPoints(await mock.getContact("c_dante"))).toBe(17);
  });

  it("go ahead with exactly enough time left", async () => {
    const mock = danteAt17();
    const { client } = timed(
      mock,
      readsTake(CHECKIN_BUDGET_MS - CRITICAL_WRITES_MS),
    );
    const result = await checkIn(client, SELF);
    expect(result).toMatchObject({ status: "checked_in", total: 18 });
  });

  it("the check is for both writes together, for a staff check-in too", async () => {
    const mock = danteAt17();
    const { client, calls } = timed(
      mock,
      readsTake(CHECKIN_BUDGET_MS - CRITICAL_WRITES_MS + 1),
    );
    const error = await checkIn(client, AS_STAFF).catch((e: unknown) => e);
    expect((error as CheckInFailure).step).toBe("group_add");
    expect(calls.some((c) => c.startsWith("addNote"))).toBe(false);
  });
});

describe("when the budget runs out after the points write", () => {
  it("the check-in still counts, and the next tap awards nothing", async () => {
    const mock = danteAt17();
    const slow = timed(mock, {
      updateContact: CHECKIN_BUDGET_MS - MIN_ATTEMPT_MS + 1,
    });

    const result = await checkIn(slow.client, SELF);
    expect(result).toMatchObject({ status: "checked_in", total: 18 });

    const again = await checkIn(mock, SELF);
    expect(again).toMatchObject({ status: "already_checked_in", total: 18 });
    expect(readPoints(await mock.getContact("c_dante"))).toBe(18);
  });
});

describe("the staff note when the budget runs out", () => {
  const spend = (leaving: number) => ({
    updateContact: CHECKIN_BUDGET_MS - leaving,
  });

  it("is written, last, when a full request's time is left", async () => {
    const mock = danteAt17();
    const { client, calls } = timed(mock, spend(REQUEST_TIMEOUT_MS));

    const result = await checkIn(client, AS_STAFF);

    expect(result).toMatchObject({ status: "checked_in", total: 18 });
    expect(calls.at(-1)).toBe("addNote:c_dante");
    expect(errors.filter((e) => e.includes("note"))).toEqual([]);
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
