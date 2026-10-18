// Check-in through HttpTidyClient and the fake TidyHQ server: the rule that a
// failure "may miss a point, but must never double-award" has to hold against
// the ways the real network fails, not just the mock's tidy errors.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TidyClient } from "../tidyhq/client";
import {
  COLORS_ISSUED_FIELD_ID,
  POINTS_FIELD_ID,
  readPoints,
} from "../tidyhq/customFields";
import {
  createFakeTidyServer,
  FAKE_ADMIN_TOKEN,
} from "../tidyhq/http/fakeTidyServer";
import { HttpTidyClient } from "../tidyhq/http/HttpTidyClient";
import { MockTidyClient } from "../tidyhq/mock/MockTidyClient";
import {
  createSeed,
  MOCK_COLORS_GROUP_ID,
  type MockSeed,
} from "../tidyhq/mock/seed";
import {
  assessCheckIn,
  CheckInFailure,
  checkIn as realCheckIn,
  type CheckInInput,
} from "./checkIn";

const NOW = new Date("2026-10-12T18:00:00Z");

/**
 * These tests are about the check-in itself, so they run with the colors
 * group unset (skipped, nothing written). colorsGroup.test.ts covers the add.
 */
type WithoutColors<T> = T extends unknown ? Omit<T, "colorsGroup"> : never;
const checkIn = (client: TidyClient, input: WithoutColors<CheckInInput>) =>
  realCheckIn(client, {
    ...input,
    colorsGroup: { problem: "not_configured" },
  } as CheckInInput);
const STAFF = {
  contactId: "c_casey",
  name: "Casey Moreno",
  role: "admin" as const,
};

function setup(edit?: (seed: MockSeed) => void) {
  const seed = createSeed(NOW);
  edit?.(seed);
  const mock = new MockTidyClient(seed, () => NOW);
  const server = createFakeTidyServer(mock);
  const http = new HttpTidyClient({
    adminToken: FAKE_ADMIN_TOKEN,
    fetch: server.fetch,
    sleep: async () => {},
  });
  return { mock, server, http };
}

/**
 * What the app would see once go-live has settled how events link to groups:
 * live events carry the group Social Night's mock event has. Until then
 * `HttpTidyClient` leaves it unset and check-in refuses (tested first).
 */
function afterGoLive(client: HttpTidyClient): TidyClient {
  return new Proxy(client, {
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
  });
}

const writes = (server: ReturnType<typeof setup>["server"]) =>
  server.requests
    .filter((r) => r.method !== "GET")
    .map((r) => `${r.method} ${r.version}${r.path}`);

const input = { eventId: "ev_tonight", contactId: "c_marcus", now: NOW };

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("check-in against the live client", () => {
  it("refuses every event, writing nothing, until the group link is verified", async () => {
    const { server, http } = setup();
    expect(await checkIn(http, input)).toEqual({
      status: "event_unavailable",
      name: "Marcus Bell",
      eventName: "Social Night",
      total: 1,
    });
    expect(writes(server)).toEqual([]);
    // Only the event and the member: no group, window or memberships read.
    expect(
      server.requests.map((r) => `${r.method} ${r.version}${r.path}`),
    ).toEqual(["GET v2/events/ev_tonight", "GET v2/contacts/c_marcus"]);
  });

  it("adds to the group, then writes the points, once each, in that order", async () => {
    const { mock, server, http } = setup();
    const result = await checkIn(afterGoLive(http), input);
    expect(result).toMatchObject({ status: "checked_in", total: 2 });
    expect(writes(server)).toEqual([
      "PUT v1/groups/grp_social_night/contacts/c_marcus",
      "PATCH v2/contacts/c_marcus",
    ]);
    expect(readPoints(await mock.getContact("c_marcus"))).toBe(2);
  });

  it("sends only the points field, and leaves every other field and contact datum alone", async () => {
    const other = {
      id: "cf_other",
      title: "Pronouns",
      type: "string" as const,
      value: "he/him",
    };
    const { mock, server, http } = setup((seed) => {
      seed.contacts.find((c) => c.id === "c_marcus")!.custom_fields.cf_other =
        other;
    });
    const before = await mock.getContact("c_marcus");
    await checkIn(afterGoLive(http), input);

    const patch = server.requests.find((r) => r.method === "PATCH")!;
    expect(patch.body).toEqual({
      custom_fields: { [POINTS_FIELD_ID]: { value: "2" } },
    });
    const sent = JSON.stringify(patch.body);
    for (const text of ["he/him", "cf_other", "Marcus", "Bell", "@"]) {
      expect(sent).not.toContain(text);
    }

    const after = await mock.getContact("c_marcus");
    expect(after.custom_fields.cf_other).toEqual(other);
    const strip = (c: typeof before) => ({
      ...c,
      updated_at: "",
      custom_fields: { ...c.custom_fields, [POINTS_FIELD_ID]: undefined },
    });
    expect(strip(after)).toEqual(strip(before));
  });

  it("never adds a member at 18+ to the colors group when the issued field is missing (LIVE-UNKNOWN missing-issued-field)", async () => {
    const { mock, server, http } = setup((seed) => {
      const marcus = seed.contacts.find((c) => c.id === "c_marcus")!;
      marcus.custom_fields[POINTS_FIELD_ID].value = "20";
      delete marcus.custom_fields[COLORS_ISSUED_FIELD_ID];
    });
    const result = await realCheckIn(afterGoLive(http), {
      ...input,
      colorsGroup: { id: MOCK_COLORS_GROUP_ID },
    });
    expect(result).toMatchObject({ status: "checked_in", total: 21 });
    expect(writes(server)).toEqual([
      "PUT v1/groups/grp_social_night/contacts/c_marcus",
      "PATCH v2/contacts/c_marcus",
    ]);
    expect(
      (await mock.listGroupContacts(MOCK_COLORS_GROUP_ID)).map((c) => c.id),
    ).toEqual([]);
  });

  it("a second tap is already checked in, and writes nothing", async () => {
    const { server, http } = setup();
    const client = afterGoLive(http);
    await checkIn(client, input);
    const before = writes(server).length;
    expect(await checkIn(client, input)).toMatchObject({
      status: "already_checked_in",
      total: 2,
    });
    expect(writes(server)).toHaveLength(before);
  });

  describe("a group add that times out but succeeded on the server", () => {
    it("fails that tap with no retry; the next tap says already checked in and awards nothing", async () => {
      const { mock, server, http } = setup();
      let lose = true;
      server.interceptAfter((req) => {
        if (req.method === "PUT" && lose) {
          lose = false;
          throw new DOMException("timed out", "TimeoutError");
        }
        return undefined;
      });
      const client = afterGoLive(http);

      const failed = await checkIn(client, input).catch((e) => e);
      expect(failed).toBeInstanceOf(CheckInFailure);
      expect(failed.step).toBe("group_add");
      expect(writes(server)).toEqual([
        "PUT v1/groups/grp_social_night/contacts/c_marcus",
      ]); // once: never retried, and no points write after a failed add
      expect(readPoints(await mock.getContact("c_marcus"))).toBe(1);

      const next = await checkIn(client, input);
      expect(next).toMatchObject({ status: "already_checked_in", total: 1 });
      expect(writes(server)).toHaveLength(1);
      expect(readPoints(await mock.getContact("c_marcus"))).toBe(1);
    });
  });

  describe("a points write that fails after the group add", () => {
    function failPoints(server: ReturnType<typeof setup>["server"]) {
      server.intercept((req) =>
        req.method === "PATCH"
          ? Response.json({ message: "down" }, { status: 503 })
          : undefined,
      );
    }

    it("is not retried: the point is missed, and the next tap awards nothing", async () => {
      const { mock, server, http } = setup();
      failPoints(server);
      const client = afterGoLive(http);

      const failed = await checkIn(client, input).catch((e) => e);
      expect(failed).toBeInstanceOf(CheckInFailure);
      expect(failed.step).toBe("points_write");
      expect(writes(server)).toEqual([
        "PUT v1/groups/grp_social_night/contacts/c_marcus",
        "PATCH v2/contacts/c_marcus",
      ]);
      expect(readPoints(await mock.getContact("c_marcus"))).toBe(1);

      const next = await checkIn(client, input);
      expect(next).toMatchObject({ status: "already_checked_in", total: 1 });
      expect(writes(server)).toHaveLength(2);
    });

    it("still writes the staff note for a staff check-in", async () => {
      const { mock, server, http } = setup();
      failPoints(server);
      const failed = await checkIn(afterGoLive(http), {
        ...input,
        method: "staff",
        staff: STAFF,
      }).catch((e) => e);
      expect(failed).toBeInstanceOf(CheckInFailure);
      expect(writes(server)).toEqual([
        "PUT v1/groups/grp_social_night/contacts/c_marcus",
        "PATCH v2/contacts/c_marcus",
        "POST v2/contacts/c_marcus/notes",
      ]);
      const notes = (await mock.getContact("c_marcus")).notes;
      expect(notes).toHaveLength(1);
      expect(notes[0].text).toContain("Casey Moreno");
    });

    it("writes no note for a self check-in", async () => {
      const { server, http } = setup();
      failPoints(server);
      await checkIn(afterGoLive(http), input).catch(() => {});
      expect(writes(server).some((w) => w.includes("notes"))).toBe(false);
    });
  });

  describe("a note that fails", () => {
    it("leaves the check-in successful and the points exactly as written", async () => {
      const { mock, server, http } = setup();
      server.intercept((req) =>
        req.method === "POST"
          ? Response.json({ message: "nope" }, { status: 500 })
          : undefined,
      );
      const result = await checkIn(afterGoLive(http), {
        ...input,
        method: "staff",
        staff: STAFF,
      });
      expect(result).toMatchObject({ status: "checked_in", total: 2 });
      expect(writes(server)).toEqual([
        "PUT v1/groups/grp_social_night/contacts/c_marcus",
        "PATCH v2/contacts/c_marcus",
        "POST v2/contacts/c_marcus/notes", // once, not retried
      ]);
      expect(readPoints(await mock.getContact("c_marcus"))).toBe(2);
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe("the points field in live mode", () => {
    const withoutPoints = (seed: MockSeed) => {
      delete seed.contacts.find((c) => c.id === "c_marcus")!.custom_fields[
        POINTS_FIELD_ID
      ];
    };

    it("refuses as points_unreadable when the field is missing, writing nothing", async () => {
      const { server, http } = setup(withoutPoints);
      const client = afterGoLive(http);
      expect(await checkIn(client, input)).toMatchObject({
        status: "points_unreadable",
      });
      expect(
        await assessCheckIn(client, {
          eventId: "ev_tonight",
          contactId: "c_marcus",
          now: NOW,
        }),
      ).toMatchObject({ status: "points_unreadable" });
      expect(writes(server)).toEqual([]);
    });

    it("counts a blank field as 0", async () => {
      const { server, http } = setup((seed) => {
        seed.contacts.find((c) => c.id === "c_marcus")!.custom_fields[
          POINTS_FIELD_ID
        ].value = "";
      });
      expect(await checkIn(afterGoLive(http), input)).toMatchObject({
        status: "checked_in",
        total: 1,
      });
      expect(writes(server)).toHaveLength(2);
    });
  });
});
