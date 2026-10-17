import { afterEach, describe, expect, it, vi } from "vitest";
import { addDays } from "../dates";
import {
  COLORS_ISSUED_FIELD_ID,
  POINTS_FIELD_ID,
  readPoints,
} from "../tidyhq/customFields";
import { TidyError } from "../tidyhq/errors";
import { MockTidyClient } from "../tidyhq/mock/MockTidyClient";
import { createSeed } from "../tidyhq/mock/seed";
import { getCheckinWindow } from "../tidyhq/checkinWindow";
import {
  assessCheckIn,
  assessCheckInFor,
  CheckInFailure,
  checkIn,
} from "./checkIn";

const NOW = new Date("2026-10-12T18:00:00Z");

function seededClient(edit?: (seed: ReturnType<typeof createSeed>) => void) {
  const seed = createSeed(NOW);
  edit?.(seed);
  return new MockTidyClient(seed, () => NOW);
}

async function storedPoints(client: MockTidyClient, contactId: string) {
  return readPoints(await client.getContact(contactId));
}

async function groupIds(client: MockTidyClient, groupId: string) {
  return (await client.listGroupContacts(groupId)).map((c) => c.id);
}

/** A time inside Pub Night's check-in window, a month before NOW. */
async function duringPubNight(client: MockTidyClient): Promise<Date> {
  const window = await client.getEventCheckinWindow("ev_pub_night");
  return new Date(new Date(window!.opens_at).getTime() + 60_000);
}

describe("checkIn", () => {
  it("names a member with a blank display name by first and last name", async () => {
    const client = seededClient((seed) => {
      Object.assign(
        seed.contacts.find((c) => c.id === "c_dante")!,
        {
          display_name: null,
        },
      );
    });
    const result = await checkIn(client, {
      eventId: "ev_tonight",
      contactId: "c_dante",
      now: NOW,
    });
    expect(result).toMatchObject({ status: "checked_in", name: "Dante Ruiz" });
  });

  it("checks in an active member and awards a point", async () => {
    const client = seededClient();
    const result = await checkIn(client, {
      eventId: "ev_tonight",
      contactId: "c_dante",
      now: NOW,
    });
    expect(result).toEqual({
      status: "checked_in",
      name: "Dante Ruiz",
      eventName: "Social Night",
      pointsAwarded: 1,
      total: 1,
      membershipNotice: null,
      qualified: [],
    });
    expect(await groupIds(client, "grp_social_night")).toContain("c_dante");
    expect(await storedPoints(client, "c_dante")).toBe(1);
  });

  it("awards an inactive contact one point however many times they tap", async () => {
    // A contact TidyHQ marks inactive can still sign in and hold a current
    // membership. Group lists must still show them, or they'd never look
    // checked in and every tap would add a point.
    const client = seededClient((seed) => {
      seed.contacts.find((c) => c.id === "c_dante")!.status = "inactive";
    });
    const tap = () =>
      checkIn(client, {
        eventId: "ev_tonight",
        contactId: "c_dante",
        now: NOW,
      });
    expect(await tap()).toMatchObject({ status: "checked_in", total: 1 });
    expect(await tap()).toMatchObject({
      status: "already_checked_in",
      total: 1,
    });
    expect(await tap()).toMatchObject({ status: "already_checked_in" });
    expect(await storedPoints(client, "c_dante")).toBe(1);
  });

  it("sees an inactive contact already in the group as checked in", async () => {
    const client = seededClient((seed) => {
      seed.contacts.find((c) => c.id === "c_dante")!.status = "inactive";
      seed.groupMembers.grp_social_night = ["c_dante"];
    });
    const result = await checkIn(client, {
      eventId: "ev_tonight",
      contactId: "c_dante",
      now: NOW,
    });
    expect(result).toMatchObject({ status: "already_checked_in", total: 0 });
    expect(await storedPoints(client, "c_dante")).toBe(0);
  });

  it("adds to the member's existing total", async () => {
    const client = seededClient();
    const result = await checkIn(client, {
      eventId: "ev_tonight",
      contactId: "c_marcus",
      now: NOW,
    });
    expect(result).toMatchObject({ status: "checked_in", total: 2 });
    expect(await storedPoints(client, "c_marcus")).toBe(2);
  });

  it("reports an existing check-in without awarding another point", async () => {
    const client = seededClient();
    const result = await checkIn(client, {
      eventId: "ev_pub_night",
      contactId: "c_marcus",
      now: await duringPubNight(client),
    });
    expect(result).toEqual({
      status: "already_checked_in",
      name: "Marcus Bell",
      eventName: "Pub Night",
      total: 1,
    });
    expect(await storedPoints(client, "c_marcus")).toBe(1);
  });

  it("reports an existing check-in after the window closes", async () => {
    const client = seededClient();
    const result = await checkIn(client, {
      eventId: "ev_pub_night",
      contactId: "c_marcus",
      now: NOW,
    });
    expect(result).toEqual({
      status: "already_checked_in",
      name: "Marcus Bell",
      eventName: "Pub Night",
      total: 1,
    });
  });

  it("reports an existing check-in even if membership has since expired", async () => {
    const client = seededClient((seed) => {
      seed.groupMembers.grp_social_night.push("c_lee");
    });
    const result = await checkIn(client, {
      eventId: "ev_tonight",
      contactId: "c_lee",
      now: NOW,
    });
    expect(result).toEqual({
      status: "already_checked_in",
      name: "Lee Hart",
      eventName: "Social Night",
      total: 0,
    });
  });

  it("gives the same total when a check-in is retried", async () => {
    const client = seededClient();
    const input = { eventId: "ev_tonight", contactId: "c_dante", now: NOW };
    await checkIn(client, input);
    const retry = await checkIn(client, input);
    expect(retry).toMatchObject({ status: "already_checked_in", total: 1 });
    expect(await storedPoints(client, "c_dante")).toBe(1);
    const members = await groupIds(client, "grp_social_night");
    expect(members.filter((id) => id === "c_dante")).toHaveLength(1);
  });

  it("adds to the stored total, not a recount of attendance", async () => {
    // Marcus attended Pub Night, but his stored total (e.g. migrated from
    // WildApricot) is the source of truth.
    const client = seededClient((seed) => {
      const marcus = seed.contacts.find((c) => c.id === "c_marcus")!;
      marcus.custom_fields.cf_sml_points.value = "0";
    });
    const result = await checkIn(client, {
      eventId: "ev_tonight",
      contactId: "c_marcus",
      now: NOW,
    });
    expect(result).toMatchObject({ status: "checked_in", total: 1 });
    expect(await storedPoints(client, "c_marcus")).toBe(1);
  });

  it("adds to a migrated balance larger than attendance", async () => {
    const client = seededClient((seed) => {
      const marcus = seed.contacts.find((c) => c.id === "c_marcus")!;
      marcus.custom_fields.cf_sml_points.value = "40";
    });
    const result = await checkIn(client, {
      eventId: "ev_tonight",
      contactId: "c_marcus",
      now: NOW,
    });
    expect(result).toMatchObject({ status: "checked_in", total: 41 });
    expect(await storedPoints(client, "c_marcus")).toBe(41);
  });

  it("adds to a stored total written with spaces and commas", async () => {
    const client = seededClient((seed) => {
      const marcus = seed.contacts.find((c) => c.id === "c_marcus")!;
      marcus.custom_fields.cf_sml_points.value = " 1,234 ";
    });
    const result = await checkIn(client, {
      eventId: "ev_tonight",
      contactId: "c_marcus",
      now: NOW,
    });
    expect(result).toMatchObject({ status: "checked_in", total: 1235 });
    expect(await storedPoints(client, "c_marcus")).toBe(1235);
  });

  it("refuses to check in over an unreadable points total", async () => {
    const client = seededClient((seed) => {
      const marcus = seed.contacts.find((c) => c.id === "c_marcus")!;
      marcus.custom_fields.cf_sml_points.value = "12.5";
    });
    const result = await checkIn(client, {
      eventId: "ev_tonight",
      contactId: "c_marcus",
      now: NOW,
    });
    expect(result).toEqual({
      status: "points_unreadable",
      name: "Marcus Bell",
      eventName: "Social Night",
      total: null,
    });
    expect(await groupIds(client, "grp_social_night")).not.toContain(
      "c_marcus",
    );
    const marcus = await client.getContact("c_marcus");
    expect(marcus.custom_fields.cf_sml_points.value).toBe("12.5");
  });

  it("reports an existing check-in with an unreadable total as null", async () => {
    const client = seededClient((seed) => {
      const marcus = seed.contacts.find((c) => c.id === "c_marcus")!;
      marcus.custom_fields.cf_sml_points.value = "12.5";
    });
    const result = await checkIn(client, {
      eventId: "ev_pub_night",
      contactId: "c_marcus",
      now: NOW,
    });
    expect(result).toMatchObject({ status: "already_checked_in", total: null });
  });

  it("never double-awards when an overlapping check-in lands between reads", async () => {
    // Request B's group read sees "not checked in", then request A runs to
    // completion before B's contact read finishes. B must not then add a
    // second point on top of A's.
    const client = seededClient();
    const input = { eventId: "ev_tonight", contactId: "c_dante", now: NOW };
    const getContact = client.getContact.bind(client);
    let overlapped = false;
    client.getContact = async (id) => {
      if (!overlapped) {
        overlapped = true;
        await checkIn(client, input); // request A
      }
      return getContact(id);
    };
    const b = await checkIn(client, input);
    expect(b).toMatchObject({ status: "already_checked_in", total: 1 });
    expect(await storedPoints(client, "c_dante")).toBe(1);
  });

  it("changes nothing when already checked in", async () => {
    const client = seededClient();
    await client.addContactToGroup("grp_social_night", "c_dante");
    const result = await checkIn(client, {
      eventId: "ev_tonight",
      contactId: "c_dante",
      now: NOW,
    });
    expect(result).toMatchObject({ status: "already_checked_in", total: 0 });
    expect(await storedPoints(client, "c_dante")).toBe(0);
  });

  it("may miss a point, but never double-awards, if the points write fails", async () => {
    const client = seededClient();
    const update = client.updateContact.bind(client);
    let failNext = true;
    client.updateContact = async (id, patch) => {
      if (failNext) {
        failNext = false;
        throw new TidyError(503, "TidyHQ unavailable");
      }
      return update(id, patch);
    };
    const input = { eventId: "ev_tonight", contactId: "c_dante", now: NOW };
    await expect(checkIn(client, input)).rejects.toBeInstanceOf(CheckInFailure);
    expect(await groupIds(client, "grp_social_night")).toContain("c_dante");

    const retry = await checkIn(client, input);
    expect(retry).toMatchObject({ status: "already_checked_in", total: 0 });
    expect(await storedPoints(client, "c_dante")).toBe(0);
  });

  it("adds to the group before awarding the point", async () => {
    const client = seededClient();
    client.addContactToGroup = async () => {
      throw new TidyError(503, "TidyHQ unavailable");
    };
    const input = { eventId: "ev_tonight", contactId: "c_dante", now: NOW };
    await expect(checkIn(client, input)).rejects.toBeInstanceOf(CheckInFailure);
    expect(await storedPoints(client, "c_dante")).toBe(0);
  });

  it("refuses a member whose membership has expired", async () => {
    const client = seededClient();
    const result = await checkIn(client, {
      eventId: "ev_tonight",
      contactId: "c_lee",
      now: NOW,
    });
    expect(result).toEqual({
      status: "membership_inactive",
      name: "Lee Hart",
      eventName: "Social Night",
      total: 0,
    });
    expect(await groupIds(client, "grp_social_night")).not.toContain("c_lee");
    expect(await storedPoints(client, "c_lee")).toBe(0);
  });

  describe("grace period and balance due", () => {
    const expiredDaysAgo = (days: number) => (client: MockTidyClient) => {
      const m = client.getMemberships.bind(client);
      client.getMemberships = async (id) =>
        (await m(id)).map((x) => ({
          ...x,
          state: "expired" as const,
          end_date: addDays("2026-10-12", -days),
        }));
    };
    const tap = (client: MockTidyClient, contactId = "c_dante") =>
      checkIn(client, { eventId: "ev_tonight", contactId, now: NOW });

    it("checks in a member in the grace period, awards a point, and says when to renew", async () => {
      const client = seededClient();
      const result = await tap(client, "c_robin");
      expect(result).toEqual({
        status: "checked_in",
        qualified: [],
        name: "Robin Vale",
        eventName: "Social Night",
        pointsAwarded: 1,
        total: 1,
        membershipNotice: {
          kind: "grace",
          expiredOn: "2026-09-22",
          renewBy: "2026-11-21",
        },
      });
      expect(await groupIds(client, "grp_social_night")).toContain("c_robin");
      expect(await storedPoints(client, "c_robin")).toBe(1);
    });

    it("allows an expired-state member whose membership ends today, with the grace message", async () => {
      const client = seededClient();
      expiredDaysAgo(0)(client);
      expect(await tap(client)).toMatchObject({
        status: "checked_in",
        membershipNotice: {
          kind: "grace",
          expiredOn: "2026-10-12",
          renewBy: "2026-12-11",
        },
      });
    });

    it("allows an expired-state member whose membership ended yesterday", async () => {
      const client = seededClient();
      expiredDaysAgo(1)(client);
      expect(await tap(client)).toMatchObject({
        status: "checked_in",
        membershipNotice: { kind: "grace", expiredOn: "2026-10-11" },
      });
    });

    it("doesn't log an expired-state membership ending today as bad data", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const client = seededClient();
      expiredDaysAgo(0)(client);
      await tap(client);
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it("allows a member exactly 60 days past their end date", async () => {
      const client = seededClient();
      expiredDaysAgo(60)(client);
      expect(await tap(client)).toMatchObject({
        status: "checked_in",
        membershipNotice: { kind: "grace", renewBy: "2026-10-12" },
      });
      expect(await storedPoints(client, "c_dante")).toBe(1);
    });

    it("refuses a member 61 days past their end date, changing nothing", async () => {
      const client = seededClient();
      expiredDaysAgo(61)(client);
      expect(await tap(client)).toMatchObject({
        status: "membership_inactive",
      });
      expect(await groupIds(client, "grp_social_night")).not.toContain(
        "c_dante",
      );
      expect(await storedPoints(client, "c_dante")).toBe(0);
    });

    it("checks in a partial member with a future end date, with the balance-due notice", async () => {
      const client = seededClient();
      const result = await tap(client, "c_avery");
      expect(result).toMatchObject({
        status: "checked_in",
        pointsAwarded: 1,
        membershipNotice: { kind: "balance_due" },
      });
      expect(await storedPoints(client, "c_avery")).toBe(1);
    });

    it("carries the notice on the assessment before the tap", async () => {
      const assessment = await assessCheckIn(seededClient(), {
        eventId: "ev_tonight",
        contactId: "c_robin",
        now: NOW,
      });
      expect(assessment).toMatchObject({
        status: "ready",
        membershipNotice: { kind: "grace" },
      });
    });

    it("carries the notice on a points-write failure, so the member still sees it", async () => {
      const client = seededClient();
      client.updateContact = async () => {
        throw new TidyError(503, "TidyHQ unavailable");
      };
      const failure = await tap(client, "c_robin").catch((e: unknown) => e);
      expect(failure).toBeInstanceOf(CheckInFailure);
      expect(failure).toMatchObject({
        step: "points_write",
        membershipNotice: { kind: "grace", expiredOn: "2026-09-22" },
      });
    });

    it("still refuses a pending or cancelled membership, however recent", async () => {
      for (const state of ["pending", "cancelled"] as const) {
        const client = seededClient();
        const m = client.getMemberships.bind(client);
        client.getMemberships = async (id) =>
          (await m(id)).map((x) => ({ ...x, state }));
        expect(await tap(client)).toMatchObject({
          status: "membership_inactive",
        });
      }
    });
  });

  it("reports an unknown event", async () => {
    const client = seededClient();
    const result = await checkIn(client, {
      eventId: "ev_nope",
      contactId: "c_dante",
      now: NOW,
    });
    expect(result).toEqual({ status: "unknown_event" });
  });

  it("treats an event with no attendance group as unknown", async () => {
    const client = seededClient((seed) => {
      const tonight = seed.events.find((e) => e.id === "ev_tonight")!;
      seed.events.push({
        ...tonight,
        id: "ev_unmapped",
        attendance_group_id: null,
      });
    });
    const result = await checkIn(client, {
      eventId: "ev_unmapped",
      contactId: "c_dante",
      now: NOW,
    });
    expect(result).toEqual({ status: "unknown_event" });
  });

  describe("an archived event", () => {
    // Social Night's window is open, as if its QR code had been printed and
    // posted before someone archived the event in TidyHQ.
    const archived = () =>
      seededClient((seed) => {
        seed.events.find((e) => e.id === "ev_tonight")!.archived = true;
      });

    it("refuses a scan of its printed QR code, and writes nothing", async () => {
      const client = archived();
      const result = await checkIn(client, {
        eventId: "ev_tonight",
        contactId: "c_dante",
        now: NOW,
      });
      expect(result).toEqual({
        status: "event_unavailable",
        name: "Dante Ruiz",
        eventName: "Social Night",
        total: 0,
      });
      expect(await groupIds(client, "grp_social_night")).toEqual([]);
      expect(await storedPoints(client, "c_dante")).toBe(0);
    });

    it("is refused ahead of the window and the membership", async () => {
      const client = archived();
      // Lee's membership lapsed; the archived refusal still comes first.
      const result = await assessCheckIn(client, {
        eventId: "ev_tonight",
        contactId: "c_lee",
        now: NOW,
      });
      expect(result.status).toBe("event_unavailable");
    });

    it("still shows an existing check-in", async () => {
      const client = archived();
      await client.addContactToGroup("grp_social_night", "c_dante");
      const result = await assessCheckIn(client, {
        eventId: "ev_tonight",
        contactId: "c_dante",
        now: NOW,
      });
      expect(result.status).toBe("already_checked_in");
    });
  });

  it("refuses check-in before the window opens", async () => {
    const client = seededClient();
    const window = await client.getEventCheckinWindow("ev_bootblack_social");
    const result = await checkIn(client, {
      eventId: "ev_bootblack_social",
      contactId: "c_dante",
      now: NOW,
    });
    expect(result).toEqual({
      status: "not_open",
      name: "Dante Ruiz",
      eventName: "Bootblack Social",
      total: 0,
      opensAt: new Date(window!.opens_at),
    });
    expect(await groupIds(client, "grp_bootblack_social")).toEqual([]);
  });

  it("refuses check-in after the window closes", async () => {
    const client = seededClient();
    const result = await checkIn(client, {
      eventId: "ev_pub_night",
      contactId: "c_dante",
      now: NOW,
    });
    expect(result).toEqual({
      status: "closed",
      name: "Dante Ruiz",
      eventName: "Pub Night",
      total: 0,
    });
    expect(await groupIds(client, "grp_pub_night")).not.toContain("c_dante");
  });

  it("checks the window before the member", async () => {
    // Expired Lee at a closed event sees "closed", not "membership_inactive".
    const client = seededClient();
    const result = await checkIn(client, {
      eventId: "ev_pub_night",
      contactId: "c_lee",
      now: NOW,
    });
    expect(result).toMatchObject({ status: "closed" });
  });

  it("reports an unknown contact (a stale session) without writing anything", async () => {
    const client = seededClient();
    const result = await checkIn(client, {
      eventId: "ev_tonight",
      contactId: "c_nobody",
      now: NOW,
    });
    expect(result).toEqual({ status: "unknown_contact" });
    expect(await groupIds(client, "grp_social_night")).not.toContain(
      "c_nobody",
    );
  });
});

describe("checkIn failures", () => {
  const input = { eventId: "ev_tonight", contactId: "c_dante", now: NOW };
  const unavailable = () => new TidyError(503, "TidyHQ unavailable");

  async function failure(client: MockTidyClient): Promise<CheckInFailure> {
    const error = await checkIn(client, input).catch((e: unknown) => e);
    if (!(error instanceof CheckInFailure))
      throw new Error("expected a CheckInFailure");
    return error;
  }

  it("names a failed points write, so the missed point can be traced", async () => {
    const client = seededClient();
    client.updateContact = async () => {
      throw unavailable();
    };
    const error = await failure(client);
    expect(error.step).toBe("points_write");
    expect(error.cause).toBeInstanceOf(TidyError);
    expect(error.cause.status).toBe(503);
  });

  it("names a failed group add", async () => {
    const client = seededClient();
    client.addContactToGroup = async () => {
      throw unavailable();
    };
    expect((await failure(client)).step).toBe("group_add");
  });

  it("names a failed lookup before anything is written", async () => {
    const client = seededClient();
    client.getMemberships = async () => {
      throw unavailable();
    };
    const error = await failure(client);
    expect(error.step).toBe("lookup");
    expect(await groupIds(client, "grp_social_night")).not.toContain("c_dante");
  });

  it("lets errors that aren't from TidyHQ through, so bugs aren't hidden", async () => {
    const client = seededClient();
    const bug = new TypeError("Cannot read properties of undefined");
    client.getEvent = async () => {
      throw bug;
    };
    await expect(checkIn(client, input)).rejects.toBe(bug);
  });

  it("lets a non-TidyHQ error in the points write through too", async () => {
    const client = seededClient();
    const bug = new TypeError("bad patch");
    client.updateContact = async () => {
      throw bug;
    };
    await expect(checkIn(client, input)).rejects.toBe(bug);
  });
});

describe("an expired-state membership dated in the future", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const withExtra = (contactId: string, end_date: string | null) => {
    const client = seededClient();
    const real = client.getMemberships.bind(client);
    client.getMemberships = async (id) => [
      ...(await real(id)),
      {
        id: "m_bad",
        state: "expired",
        status: "Expired",
        membership_level_id: "lvl_full",
        contact_id: contactId,
        start_date: "2026-01-01",
        end_date,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ];
    return client;
  };
  const input = { eventId: "ev_tonight", contactId: "c_dante", now: NOW };

  it("doesn't shut out a member who also has a good active membership", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const client = withExtra("c_dante", "2030-01-01");
    expect(await checkIn(client, input)).toMatchObject({
      status: "checked_in",
    });
    expect(warn).toHaveBeenCalledWith(
      "inconsistent membership record",
      expect.objectContaining({ contactId: "c_dante", membershipId: "m_bad" }),
    );
  });

  it("logs only ids and the problem, no personal data", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await assessCheckIn(withExtra("c_dante", null), input);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][1]).toEqual({
      contactId: "c_dante",
      membershipId: "m_bad",
      problem: "expired_not_ended",
    });
  });

  it("stays quiet for ordinary records", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await assessCheckIn(seededClient(), input);
    await assessCheckIn(seededClient(), { ...input, contactId: "c_robin" });
    await assessCheckIn(seededClient(), { ...input, contactId: "c_lee" });
    expect(warn).not.toHaveBeenCalled();
  });

  it("still refuses a member whose only membership is one, and logs it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const client = seededClient();
    client.getMemberships = async () => [
      {
        id: "m_bad",
        state: "expired",
        status: "Expired",
        membership_level_id: "lvl_full",
        contact_id: "c_dante",
        start_date: "2026-01-01",
        end_date: "2030-01-01",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ];
    expect(await assessCheckIn(client, input)).toMatchObject({
      status: "membership_inactive",
    });
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("assessCheckIn", () => {
  const RENEWED = {
    state: "activated",
    status: "Activated",
    end_date: "2099-12-31",
  } as const;

  it("reports a member who can check in now", async () => {
    const assessment = await assessCheckIn(seededClient(), {
      eventId: "ev_tonight",
      contactId: "c_dante",
      now: NOW,
    });
    expect(assessment).toMatchObject({
      status: "ready",
      name: "Dante Ruiz",
      eventName: "Social Night",
    });
  });

  it("reports a check-in and the stored total, read back from TidyHQ", async () => {
    const client = seededClient();
    const input = { eventId: "ev_tonight", contactId: "c_dante", now: NOW };
    await checkIn(client, input);
    expect(await assessCheckIn(client, input)).toEqual({
      status: "already_checked_in",
      name: "Dante Ruiz",
      eventName: "Social Night",
      total: 1,
    });
  });

  it("reports an unreadable total as null", async () => {
    const client = seededClient((seed) => {
      const marcus = seed.contacts.find((c) => c.id === "c_marcus")!;
      marcus.custom_fields.cf_sml_points.value = "12.5";
    });
    const assessment = await assessCheckIn(client, {
      eventId: "ev_pub_night",
      contactId: "c_marcus",
      now: NOW,
    });
    expect(assessment).toMatchObject({
      status: "already_checked_in",
      total: null,
    });
  });

  it("changes nothing in TidyHQ", async () => {
    const client = seededClient();
    await assessCheckIn(client, {
      eventId: "ev_tonight",
      contactId: "c_dante",
      now: NOW,
    });
    expect(await groupIds(client, "grp_social_night")).not.toContain("c_dante");
    expect(await storedPoints(client, "c_dante")).toBe(0);
  });

  it("explains each refusal the way the tap would", async () => {
    // Every refusal the page shows before the tap is the one the tap gets.
    const cases = [
      {
        eventId: "ev_tonight",
        contactId: "c_lee",
        status: "membership_inactive",
      },
      {
        eventId: "ev_bootblack_social",
        contactId: "c_dante",
        status: "not_open",
      },
      { eventId: "ev_pub_night", contactId: "c_dante", status: "closed" },
      {
        eventId: "ev_pub_night",
        contactId: "c_marcus",
        status: "already_checked_in",
      },
      { eventId: "ev_nope", contactId: "c_dante", status: "unknown_event" },
      {
        eventId: "ev_leather_brunch",
        contactId: "c_dante",
        status: "event_unavailable",
      },
      {
        eventId: "ev_tonight",
        contactId: "c_nobody",
        status: "unknown_contact",
      },
    ];
    for (const { status, ...ids } of cases) {
      const client = seededClient((seed) => {
        seed.events.find((e) => e.id === "ev_leather_brunch")!.archived = true;
      });
      const input = { ...ids, now: NOW };
      expect((await assessCheckIn(client, input)).status, status).toBe(status);
      expect(await checkIn(client, input)).toEqual(
        await assessCheckIn(client, input),
      );
    }
  });

  it("asks TidyHQ again after an expired member renews", async () => {
    // What the "I've renewed, check me in" link relies on: nothing remembers
    // the earlier refusal.
    const client = seededClient();
    const input = { eventId: "ev_tonight", contactId: "c_lee", now: NOW };
    expect(await assessCheckIn(client, input)).toMatchObject({
      status: "membership_inactive",
    });

    const getMemberships = client.getMemberships.bind(client);
    client.getMemberships = async (id) =>
      (await getMemberships(id)).map((m) => ({ ...m, ...RENEWED }));

    expect(await assessCheckIn(client, input)).toMatchObject({
      status: "ready",
    });
    expect(await checkIn(client, input)).toMatchObject({
      status: "checked_in",
      pointsAwarded: 1,
    });
  });
});

describe("rewards reached by a check-in", () => {
  function setField(
    seed: ReturnType<typeof createSeed>,
    contactId: string,
    fieldId: string,
    value: string,
  ) {
    const contact = seed.contacts.find((c) => c.id === contactId)!;
    contact.custom_fields[fieldId] = {
      id: fieldId,
      title: fieldId,
      type: "string",
      value,
    };
  }

  const input = { eventId: "ev_tonight", contactId: "c_dante", now: NOW };

  it("reports club colors when the point brings a current member to 18", async () => {
    const client = seededClient((seed) =>
      setField(seed, "c_dante", POINTS_FIELD_ID, "17"),
    );
    expect(await checkIn(client, input)).toMatchObject({
      status: "checked_in",
      total: 18,
      qualified: [{ rewardId: "club_colors", standing: "current" }],
    });
  });

  it("carries the standing from membershipStanding, not the notice", async () => {
    const client = seededClient((seed) =>
      setField(seed, "c_avery", POINTS_FIELD_ID, "17"),
    );
    expect(
      await checkIn(client, { ...input, contactId: "c_avery" }),
    ).toMatchObject({
      qualified: [{ rewardId: "club_colors", standing: "balance_due" }],
    });
  });

  it("reports grace for a member in the grace period", async () => {
    const client = seededClient((seed) =>
      setField(seed, "c_robin", POINTS_FIELD_ID, "17"),
    );
    expect(
      await checkIn(client, { ...input, contactId: "c_robin" }),
    ).toMatchObject({
      qualified: [{ rewardId: "club_colors", standing: "grace" }],
    });
  });

  it("reports nothing when they already had 18", async () => {
    const client = seededClient((seed) =>
      setField(seed, "c_dante", POINTS_FIELD_ID, "18"),
    );
    expect(await checkIn(client, input)).toMatchObject({ qualified: [] });
  });

  it("reports nothing when they're still short", async () => {
    expect(await checkIn(seededClient(), input)).toMatchObject({
      qualified: [],
    });
  });

  it("reports nothing when colors are already issued", async () => {
    const client = seededClient((seed) => {
      setField(seed, "c_dante", POINTS_FIELD_ID, "17");
      setField(seed, "c_dante", COLORS_ISSUED_FIELD_ID, "yes");
    });
    expect(await checkIn(client, input)).toMatchObject({ qualified: [] });
  });

  it("reports nothing when the issued field is unreadable", async () => {
    const client = seededClient((seed) => {
      setField(seed, "c_dante", POINTS_FIELD_ID, "17");
      setField(seed, "c_dante", COLORS_ISSUED_FIELD_ID, "maybe");
    });
    expect(await checkIn(client, input)).toMatchObject({ qualified: [] });
  });

  it("never writes the issued field", async () => {
    const client = seededClient((seed) =>
      setField(seed, "c_dante", POINTS_FIELD_ID, "17"),
    );
    const update = vi.spyOn(client, "updateContact");
    await checkIn(client, input);
    for (const [, patch] of update.mock.calls) {
      expect(Object.keys(patch.custom_fields ?? {})).toEqual([POINTS_FIELD_ID]);
    }
  });
});

describe("a staff check-in", () => {
  const staff = {
    contactId: "c_pat",
    name: "Pat Rivera",
    role: "volunteer",
  } as const;
  const input = {
    eventId: "ev_tonight",
    contactId: "c_dante",
    method: "staff",
    staff,
    now: NOW,
  } as const;
  const notesOf = async (client: MockTidyClient, id: string) =>
    (await client.getContact(id)).notes.map((n) => n.text);

  it("awards the point like a self check-in, and writes a note saying who did it", async () => {
    const client = seededClient();
    const result = await checkIn(client, input);
    expect(result).toMatchObject({
      status: "checked_in",
      pointsAwarded: 1,
      total: 1,
    });
    expect(await groupIds(client, "grp_social_night")).toContain("c_dante");
    expect(await storedPoints(client, "c_dante")).toBe(1);
    expect(await notesOf(client, "c_dante")).toEqual([
      "Checked in to Social Night (ev_tonight) by volunteer: Pat Rivera (c_pat), 2026-10-12 11:00 AM",
    ]);
  });

  it("writes no note for a self check-in", async () => {
    const client = seededClient();
    await checkIn(client, {
      eventId: "ev_tonight",
      contactId: "c_dante",
      now: NOW,
    });
    expect(await notesOf(client, "c_dante")).toEqual([]);
  });

  it("writes no note when the member was already checked in", async () => {
    const client = seededClient();
    await checkIn(client, input);
    const again = await checkIn(client, input);
    expect(again.status).toBe("already_checked_in");
    expect(await notesOf(client, "c_dante")).toHaveLength(1);
    expect(await storedPoints(client, "c_dante")).toBe(1);
  });

  it("writes no note for a refused member", async () => {
    const client = seededClient();
    const result = await checkIn(client, { ...input, contactId: "c_lee" });
    expect(result.status).toBe("membership_inactive");
    expect(await notesOf(client, "c_lee")).toEqual([]);
  });

  it("writes the note after the group add and the points write", async () => {
    const client = seededClient();
    const order: string[] = [];
    for (const method of [
      "addContactToGroup",
      "updateContact",
      "addNote",
    ] as const) {
      const original = client[method].bind(client) as (
        ...a: unknown[]
      ) => Promise<unknown>;
      vi.spyOn(client, method).mockImplementation(
        async (...args: unknown[]) => {
          order.push(method);
          return original(...args) as never;
        },
      );
    }
    await checkIn(client, input);
    expect(order).toEqual(["addContactToGroup", "updateContact", "addNote"]);
  });

  it("still succeeds, with the same total, if the note fails", async () => {
    const client = seededClient();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const update = vi.spyOn(client, "updateContact");
    vi.spyOn(client, "addNote").mockRejectedValue(new TidyError(500, "boom"));
    const result = await checkIn(client, input);
    expect(result).toMatchObject({ status: "checked_in", total: 1 });
    expect(update).toHaveBeenCalledTimes(1);
    expect(await storedPoints(client, "c_dante")).toBe(1);
  });

  it("swallows a failure that isn't from TidyHQ too, since the points are already written", async () => {
    const client = seededClient();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(client, "addNote").mockRejectedValue(new TypeError("bug"));
    const result = await checkIn(client, input);
    expect(result).toMatchObject({ status: "checked_in", total: 1 });
  });

  it("logs a failed note with ids and the error, not the note text or a token", async () => {
    const client = seededClient();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(client, "addNote").mockRejectedValue(new TidyError(500, "boom"));
    await checkIn(client, input);
    expect(log).toHaveBeenCalledWith("staff check-in note failed", {
      eventId: "ev_tonight",
      contactId: "c_dante",
      error: "TidyError 500: boom",
    });
  });
});

describe("assessCheckIn carries the points total on refusals", () => {
  it("includes the stored total where the member is known", async () => {
    const client = seededClient();
    const at = (eventId: string, contactId: string) =>
      assessCheckIn(client, { eventId, contactId, now: NOW });
    expect(await at("ev_tonight", "c_lee")).toMatchObject({
      status: "membership_inactive",
      total: 0,
    });
    expect(await at("ev_pub_night", "c_riley")).toMatchObject({
      status: "closed",
      total: 17,
    });
    expect(await at("ev_bootblack_social", "c_riley")).toMatchObject({
      status: "not_open",
      total: 17,
    });
  });

  it("reports an unreadable total as null", async () => {
    const client = seededClient((seed) => {
      seed.contacts.find((c) => c.id === "c_dante")!.custom_fields[
        POINTS_FIELD_ID
      ].value = "lots";
    });
    expect(
      await assessCheckIn(client, {
        eventId: "ev_tonight",
        contactId: "c_dante",
        now: NOW,
      }),
    ).toMatchObject({ status: "points_unreadable", total: null });
  });
});

describe("a staff check-in whose points write fails", () => {
  const staff = {
    contactId: "c_pat",
    name: "Pat Rivera",
    role: "volunteer",
  } as const;
  const input = {
    eventId: "ev_tonight",
    contactId: "c_dante",
    method: "staff",
    staff,
    now: NOW,
  } as const;
  const notes = async (client: MockTidyClient) =>
    (await client.getContact("c_dante")).notes.map((n) => n.text);

  it("still leaves the note, and still reports the failure", async () => {
    const client = seededClient();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(client, "updateContact").mockRejectedValue(
      new TidyError(503, "down"),
    );
    await expect(checkIn(client, input)).rejects.toMatchObject({
      name: "CheckInFailure",
      step: "points_write",
    });
    expect(await groupIds(client, "grp_social_night")).toContain("c_dante");
    expect(await notes(client)).toEqual([
      expect.stringContaining("by volunteer: Pat Rivera (c_pat)"),
    ]);
    expect(await storedPoints(client, "c_dante")).toBe(0);
  });

  it("writes the note after the group add, and never touches points", async () => {
    const client = seededClient();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const order: string[] = [];
    const wrap = (method: "addContactToGroup" | "addNote") => {
      const original = client[method].bind(client) as (
        ...a: unknown[]
      ) => Promise<unknown>;
      vi.spyOn(client, method).mockImplementation(
        async (...args: unknown[]) => {
          order.push(method);
          return original(...args) as never;
        },
      );
    };
    wrap("addContactToGroup");
    wrap("addNote");
    const update = vi
      .spyOn(client, "updateContact")
      .mockRejectedValue(new TidyError(503, "down"));
    await checkIn(client, input).catch(() => {});
    expect(order).toEqual(["addContactToGroup", "addNote"]);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("swallows a failing note, so the original failure is the one reported", async () => {
    const client = seededClient();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(client, "updateContact").mockRejectedValue(
      new TidyError(503, "down"),
    );
    vi.spyOn(client, "addNote").mockRejectedValue(new TypeError("bug"));
    await expect(checkIn(client, input)).rejects.toMatchObject({
      name: "CheckInFailure",
      step: "points_write",
    });
  });

  it("leaves no note for a self check-in, or when the group add fails", async () => {
    const client = seededClient();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(client, "updateContact").mockRejectedValue(
      new TidyError(503, "down"),
    );
    await checkIn(client, {
      eventId: "ev_tonight",
      contactId: "c_dante",
      now: NOW,
    }).catch(() => {});
    expect(await notes(client)).toEqual([]);

    const other = seededClient();
    vi.spyOn(other, "addContactToGroup").mockRejectedValue(
      new TidyError(503, "down"),
    );
    await checkIn(other, input).catch(() => {});
    expect(await notes(other)).toEqual([]);
  });
});

describe("assessCheckInFor", () => {
  it("assesses with the event and window already read, without reading them again", async () => {
    const client = seededClient();
    const event = await client.getEvent("ev_tonight");
    const window = await getCheckinWindow(client, event);
    const getEvent = vi.spyOn(client, "getEvent");
    const getWindow = vi.spyOn(client, "getEventCheckinWindow");
    const result = await assessCheckInFor(client, {
      contactId: "c_dante",
      now: NOW,
      event,
      groupId: "grp_social_night",
      window,
    });
    expect(result.status).toBe("ready");
    expect(getEvent).not.toHaveBeenCalled();
    expect(getWindow).not.toHaveBeenCalled();
    expect(result).toEqual(
      await assessCheckIn(client, {
        eventId: "ev_tonight",
        contactId: "c_dante",
        now: NOW,
      }),
    );
  });
});
