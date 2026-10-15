import { describe, expect, it, vi } from "vitest";
import { REWARDS } from "../points";
import {
  COLORS_ISSUED_FIELD_ID,
  POINTS_FIELD_ID,
} from "../tidyhq/customFields";
import { TidyError } from "../tidyhq/errors";
import { MockTidyClient } from "../tidyhq/mock/MockTidyClient";
import { createSeed, type MockSeed } from "../tidyhq/mock/seed";
import type { Membership } from "../tidyhq/types";
import { getMemberSummary, UNKNOWN_LEVEL_NAME } from "./memberSummary";

// 18:00 UTC is 11am in Seattle, so the Seattle date is 2026-10-12.
const NOW = new Date("2026-10-12T18:00:00Z");

function seededClient(edit?: (seed: MockSeed) => void) {
  const seed = createSeed(NOW);
  edit?.(seed);
  return new MockTidyClient(seed, () => NOW);
}

function extraMembership(
  overrides: Partial<Membership> & Pick<Membership, "id" | "contact_id">,
): Membership {
  return {
    state: "activated",
    status: "Activated",
    membership_level_id: "lvl_full",
    start_date: "2026-01-01",
    end_date: "2027-01-01",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("getMemberSummary", () => {
  it("summarizes an active member", async () => {
    const result = await getMemberSummary(seededClient(), {
      contactId: "c_dante",
      now: NOW,
    });
    expect(result).toEqual({
      status: "ok",
      name: "Dante Ruiz",
      level: "Full Member",
      membershipEndsOn: "2027-03-26",
      membership: "active",
      notice: null,
      points: 0,
      rewards: [
        {
          reward: REWARDS[0],
          status: { kind: "progress", remaining: 18 },
          message: "18 more points until you qualify for club colors.",
        },
      ],
    });
  });

  it("reports the stored points total", async () => {
    const result = await getMemberSummary(seededClient(), {
      contactId: "c_marcus",
      now: NOW,
    });
    expect(result).toMatchObject({ status: "ok", points: 1 });
  });

  it("flags a membership ending in two weeks as renew_soon", async () => {
    const result = await getMemberSummary(seededClient(), {
      contactId: "c_sam",
      now: NOW,
    });
    expect(result).toMatchObject({
      status: "ok",
      membership: "renew_soon",
      membershipEndsOn: "2026-10-26",
    });
  });

  it("is renew_soon exactly RENEWAL_REMINDER_DAYS out, active one day later", async () => {
    const endingIn = (days: number) =>
      seededClient((seed) => {
        seed.memberships = [
          extraMembership({
            id: "m_edge",
            contact_id: "c_dante",
            end_date: new Date(Date.UTC(2026, 9, 12 + days))
              .toISOString()
              .slice(0, 10),
          }),
        ];
      });
    const at30 = await getMemberSummary(endingIn(30), {
      contactId: "c_dante",
      now: NOW,
    });
    const at31 = await getMemberSummary(endingIn(31), {
      contactId: "c_dante",
      now: NOW,
    });
    expect(at30).toMatchObject({ membership: "renew_soon" });
    expect(at31).toMatchObject({ membership: "active" });
  });

  it("is renew_soon on the last day of the membership", async () => {
    const client = seededClient((seed) => {
      seed.memberships = [
        extraMembership({
          id: "m_last",
          contact_id: "c_dante",
          end_date: "2026-10-12",
        }),
      ];
    });
    const result = await getMemberSummary(client, {
      contactId: "c_dante",
      now: NOW,
    });
    expect(result).toMatchObject({ membership: "renew_soon" });
  });

  it("treats an open-ended membership as active, never renew_soon", async () => {
    const client = seededClient((seed) => {
      seed.memberships = [
        extraMembership({
          id: "m_open",
          contact_id: "c_dante",
          end_date: null,
        }),
      ];
    });
    const result = await getMemberSummary(client, {
      contactId: "c_dante",
      now: NOW,
    });
    expect(result).toMatchObject({
      membership: "active",
      membershipEndsOn: null,
    });
  });

  it("shows an expired member their last level and end date", async () => {
    const result = await getMemberSummary(seededClient(), {
      contactId: "c_lee",
      now: NOW,
    });
    expect(result).toMatchObject({
      status: "ok",
      name: "Lee Hart",
      level: "Full Member",
      membership: "expired",
      membershipEndsOn: "2026-07-14",
    });
  });

  it("uses the active membership with the latest end date among several", async () => {
    const client = seededClient((seed) => {
      seed.memberships = [
        extraMembership({
          id: "m_a",
          contact_id: "c_dante",
          membership_level_id: "lvl_associate",
          end_date: "2026-12-01",
        }),
        extraMembership({
          id: "m_b",
          contact_id: "c_dante",
          membership_level_id: "lvl_full",
          end_date: "2027-06-01",
        }),
        // Ends later than both but isn't active, so it must not win.
        extraMembership({
          id: "m_c",
          contact_id: "c_dante",
          membership_level_id: "lvl_associate",
          state: "cancelled",
          end_date: "2030-01-01",
        }),
      ];
    });
    const result = await getMemberSummary(client, {
      contactId: "c_dante",
      now: NOW,
    });
    expect(result).toMatchObject({
      level: "Full Member",
      membershipEndsOn: "2027-06-01",
      membership: "active",
    });
  });

  it("prefers an active membership over a later-ending expired one", async () => {
    const client = seededClient((seed) => {
      seed.memberships = [
        extraMembership({
          id: "m_old",
          contact_id: "c_dante",
          membership_level_id: "lvl_associate",
          state: "expired",
          end_date: "2026-11-01",
        }),
        extraMembership({
          id: "m_now",
          contact_id: "c_dante",
          membership_level_id: "lvl_full",
          end_date: "2026-12-01",
        }),
      ];
    });
    const result = await getMemberSummary(client, {
      contactId: "c_dante",
      now: NOW,
    });
    expect(result).toMatchObject({
      level: "Full Member",
      membershipEndsOn: "2026-12-01",
    });
  });

  it("uses the latest-ending membership when none is active", async () => {
    const client = seededClient((seed) => {
      seed.memberships = [
        extraMembership({
          id: "m_older",
          contact_id: "c_lee",
          membership_level_id: "lvl_full",
          state: "expired",
          end_date: "2025-09-01",
        }),
        extraMembership({
          id: "m_newer",
          contact_id: "c_lee",
          membership_level_id: "lvl_associate",
          state: "expired",
          end_date: "2026-07-01",
        }),
      ];
    });
    const result = await getMemberSummary(client, {
      contactId: "c_lee",
      now: NOW,
    });
    expect(result).toMatchObject({
      level: "Associate Member",
      membershipEndsOn: "2026-07-01",
      membership: "expired",
    });
  });

  describe("grace period and balance due", () => {
    const withMembership = (overrides: Partial<Membership>) =>
      seededClient((seed) => {
        seed.memberships = [
          extraMembership({
            id: "m_edge",
            contact_id: "c_dante",
            ...overrides,
          }),
        ];
      });
    const summary = (client: MockTidyClient) =>
      getMemberSummary(client, { contactId: "c_dante", now: NOW });

    it("shows a member in the grace period the dates to renew by", async () => {
      const result = await getMemberSummary(seededClient(), {
        contactId: "c_robin",
        now: NOW,
      });
      expect(result).toMatchObject({
        status: "ok",
        name: "Robin Vale",
        membership: "grace",
        membershipEndsOn: "2026-09-22",
        notice: {
          kind: "grace",
          expiredOn: "2026-09-22",
          renewBy: "2026-11-21",
        },
      });
    });

    it("is grace exactly 60 days past the end date, expired 61 days past", async () => {
      const at60 = await summary(
        withMembership({ state: "expired", end_date: "2026-08-13" }),
      );
      const at61 = await summary(
        withMembership({ state: "expired", end_date: "2026-08-12" }),
      );
      expect(at60).toMatchObject({ membership: "grace" });
      expect(at61).toMatchObject({ membership: "expired", notice: null });
    });

    it("is grace for an expired-state membership ending today", async () => {
      const result = await summary(
        withMembership({ state: "expired", end_date: "2026-10-12" }),
      );
      expect(result).toMatchObject({
        membership: "grace",
        notice: { kind: "grace", expiredOn: "2026-10-12" },
      });
    });

    it("is grace for a still-activated membership past its end date", async () => {
      const result = await summary(
        withMembership({ state: "activated", end_date: "2026-10-01" }),
      );
      expect(result).toMatchObject({ membership: "grace" });
    });

    it("shows a balance due for a partial membership with a future end date", async () => {
      const result = await getMemberSummary(seededClient(), {
        contactId: "c_avery",
        now: NOW,
      });
      expect(result).toMatchObject({
        status: "ok",
        name: "Avery Quinn",
        membership: "balance_due",
        notice: { kind: "balance_due" },
      });
    });

    it("puts the balance due ahead of the renewal reminder", async () => {
      const result = await summary(
        withMembership({
          state: "partial",
          status: "Partial",
          end_date: "2026-10-26",
        }),
      );
      expect(result).toMatchObject({
        membership: "balance_due",
        membershipEndsOn: "2026-10-26",
      });
    });

    it("has no notice for a plain active member or a renewal reminder", async () => {
      expect(await summary(seededClient())).toMatchObject({ notice: null });
      const sam = await getMemberSummary(seededClient(), {
        contactId: "c_sam",
        now: NOW,
      });
      expect(sam).toMatchObject({ membership: "renew_soon", notice: null });
    });
  });

  it("shows a later-dated expired-state row as the end date of the good membership, not its own", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const client = seededClient((seed) => {
      seed.memberships = [
        extraMembership({
          id: "m_good",
          contact_id: "c_dante",
          end_date: "2027-03-01",
        }),
        extraMembership({
          id: "m_bad",
          contact_id: "c_dante",
          state: "expired",
          end_date: null,
        }),
      ];
    });
    const result = await getMemberSummary(client, {
      contactId: "c_dante",
      now: NOW,
    });
    expect(result).toMatchObject({
      membership: "active",
      membershipEndsOn: "2027-03-01",
    });
    expect(warn).toHaveBeenCalledWith("inconsistent membership record", {
      contactId: "c_dante",
      membershipId: "m_bad",
      problem: "expired_not_ended",
    });
    warn.mockRestore();
  });

  it("shows a timestamp end date as a plain date", async () => {
    const client = seededClient((seed) => {
      seed.memberships = [
        extraMembership({
          id: "m_ts",
          contact_id: "c_dante",
          state: "expired",
          end_date: "2026-09-22T00:00:00Z",
        }),
      ];
    });
    const result = await getMemberSummary(client, {
      contactId: "c_dante",
      now: NOW,
    });
    expect(result).toMatchObject({
      membership: "grace",
      membershipEndsOn: "2026-09-22",
    });
  });

  it("returns not_member when TidyHQ has no membership on record", async () => {
    const client = seededClient((seed) => {
      seed.memberships = [];
    });
    const result = await getMemberSummary(client, {
      contactId: "c_dante",
      now: NOW,
    });
    expect(result).toEqual({
      status: "not_member",
      name: "Dante Ruiz",
      points: 0,
    });
  });

  it("keeps a non-member's points, null if unreadable", async () => {
    const client = seededClient((seed) => {
      seed.memberships = [];
      seed.contacts.find((c) => c.id === "c_dante")!.custom_fields[
        POINTS_FIELD_ID
      ].value = "abc";
    });
    const result = await getMemberSummary(client, {
      contactId: "c_dante",
      now: NOW,
    });
    expect(result).toMatchObject({ status: "not_member", points: null });
  });

  it("passes unreadable points through as null", async () => {
    const client = seededClient((seed) => {
      seed.contacts.find((c) => c.id === "c_dante")!.custom_fields[
        POINTS_FIELD_ID
      ].value = "12.5";
    });
    const result = await getMemberSummary(client, {
      contactId: "c_dante",
      now: NOW,
    });
    expect(result).toMatchObject({ status: "ok", points: null });
  });

  it("returns unknown_contact when TidyHQ no longer has the contact", async () => {
    const result = await getMemberSummary(seededClient(), {
      contactId: "c_gone",
      now: NOW,
    });
    expect(result).toEqual({ status: "unknown_contact" });
  });

  it("ignores a not-yet-started membership when deciding expired", async () => {
    const client = seededClient((seed) => {
      seed.memberships.push(
        extraMembership({
          id: "m_future",
          contact_id: "c_lee",
          membership_level_id: "lvl_associate",
          start_date: "2026-11-01",
          end_date: "2027-11-01",
        }),
      );
    });
    const result = await getMemberSummary(client, {
      contactId: "c_lee",
      now: NOW,
    });
    expect(result).toMatchObject({
      level: "Full Member",
      membership: "expired",
      membershipEndsOn: "2026-07-14",
    });
  });

  it("ignores pending and cancelled memberships when none is active", async () => {
    const client = seededClient((seed) => {
      seed.memberships.push(
        extraMembership({
          id: "m_cancelled",
          contact_id: "c_lee",
          membership_level_id: "lvl_associate",
          state: "cancelled",
          end_date: "2030-01-01",
        }),
        extraMembership({
          id: "m_pending",
          contact_id: "c_lee",
          membership_level_id: "lvl_associate",
          state: "pending",
          end_date: "2027-10-12",
        }),
      );
    });
    const result = await getMemberSummary(client, {
      contactId: "c_lee",
      now: NOW,
    });
    expect(result).toMatchObject({
      level: "Full Member",
      membership: "expired",
      membershipEndsOn: "2026-07-14",
    });
  });

  it("doesn't let an open-ended cancelled membership beat a real expired one", async () => {
    const client = seededClient((seed) => {
      seed.memberships = [
        extraMembership({
          id: "m_expired",
          contact_id: "c_lee",
          membership_level_id: "lvl_full",
          state: "expired",
          end_date: "2026-07-01",
        }),
        extraMembership({
          id: "m_cancelled_open",
          contact_id: "c_lee",
          membership_level_id: "lvl_associate",
          state: "cancelled",
          end_date: null,
        }),
      ];
    });
    const result = await getMemberSummary(client, {
      contactId: "c_lee",
      now: NOW,
    });
    expect(result).toMatchObject({
      level: "Full Member",
      membership: "expired",
      membershipEndsOn: "2026-07-01",
    });
  });

  it("returns not_member when the only memberships are pending or cancelled", async () => {
    const client = seededClient((seed) => {
      seed.memberships = [
        extraMembership({ id: "m_p", contact_id: "c_dante", state: "pending" }),
        extraMembership({
          id: "m_c",
          contact_id: "c_dante",
          state: "cancelled",
        }),
      ];
    });
    const result = await getMemberSummary(client, {
      contactId: "c_dante",
      now: NOW,
    });
    expect(result).toEqual({
      status: "not_member",
      name: "Dante Ruiz",
      points: 0,
    });
  });

  it("uses a generic level name if TidyHQ no longer has the level", async () => {
    const client = seededClient((seed) => {
      seed.membershipLevels = seed.membershipLevels.filter(
        (l) => l.id !== "lvl_full",
      );
    });
    const result = await getMemberSummary(client, {
      contactId: "c_dante",
      now: NOW,
    });
    expect(result).toMatchObject({
      status: "ok",
      level: UNKNOWN_LEVEL_NAME,
      membership: "active",
    });
  });

  it("lets other errors reading the level through", async () => {
    const client = seededClient();
    client.getMembershipLevel = async () => {
      throw new TidyError(503, "TidyHQ unavailable");
    };
    await expect(
      getMemberSummary(client, { contactId: "c_dante", now: NOW }),
    ).rejects.toBeInstanceOf(TidyError);
  });

  it("returns unknown_contact if the memberships read finds no contact", async () => {
    const client = seededClient();
    client.getMemberships = async () => {
      throw new TidyError(404, "Contact c_dante not found");
    };
    const result = await getMemberSummary(client, {
      contactId: "c_dante",
      now: NOW,
    });
    expect(result).toEqual({ status: "unknown_contact" });
  });

  it("reads the contact and memberships at the same time", async () => {
    const client = seededClient();
    let releaseContact!: () => void;
    const contactRead = client.getContact.bind(client);
    client.getContact = (id) =>
      new Promise((resolve) => {
        releaseContact = () => resolve(contactRead(id));
      });
    const membershipsRead = vi.spyOn(client, "getMemberships");
    const pending = getMemberSummary(client, {
      contactId: "c_dante",
      now: NOW,
    });
    await Promise.resolve();
    expect(membershipsRead).toHaveBeenCalled();
    releaseContact();
    expect(await pending).toMatchObject({ status: "ok" });
  });

  it("changes nothing in TidyHQ", async () => {
    const client = seededClient();
    const writes = [
      vi.spyOn(client, "updateContact"),
      vi.spyOn(client, "addNote"),
      vi.spyOn(client, "addContactToGroup"),
    ];
    const before = JSON.stringify(await client.getContact("c_sam"));
    await getMemberSummary(client, { contactId: "c_sam", now: NOW });
    expect(JSON.stringify(await client.getContact("c_sam"))).toBe(before);
    for (const write of writes) expect(write).not.toHaveBeenCalled();
  });

  describe("rewards", () => {
    const rewardsFor = async (
      contactId: string,
      edit?: (seed: MockSeed) => void,
    ) => {
      const result = await getMemberSummary(seededClient(edit), {
        contactId,
        now: NOW,
      });
      return result.status === "ok" ? result.rewards : undefined;
    };

    const setField = (
      seed: MockSeed,
      contactId: string,
      fieldId: string,
      value: string,
    ) => {
      seed.contacts.find((c) => c.id === contactId)!.custom_fields[fieldId] = {
        id: fieldId,
        title: fieldId,
        type: "string",
        value,
      };
    };

    it("counts down to club colors", async () => {
      expect(await rewardsFor("c_marcus")).toEqual([
        {
          reward: REWARDS[0],
          status: { kind: "progress", remaining: 17 },
          message: "17 more points until you qualify for club colors.",
        },
      ]);
    });

    it("tells a current member at 18 points that a Board member will connect", async () => {
      expect(await rewardsFor("c_taylor")).toEqual([
        {
          reward: REWARDS[0],
          status: { kind: "qualified" },
          message:
            "You qualify for club colors! A Board member will connect with you to distribute your club colors.",
        },
      ]);
    });

    it("says colors are issued, even above the threshold", async () => {
      expect(await rewardsFor("c_morgan")).toMatchObject([
        { status: { kind: "issued" }, message: "Club colors received ✓" },
      ]);
    });

    it("says colors are issued even under 18 points", async () => {
      const rewards = await rewardsFor("c_dante", (seed) =>
        setField(seed, "c_dante", COLORS_ISSUED_FIELD_ID, "yes"),
      );
      expect(rewards).toMatchObject([{ status: { kind: "issued" } }]);
    });

    it("asks a member with a balance due to complete payment", async () => {
      const rewards = await rewardsFor("c_avery", (seed) =>
        setField(seed, "c_avery", POINTS_FIELD_ID, "18"),
      );
      expect(rewards).toMatchObject([
        {
          status: { kind: "qualified" },
          message:
            "You qualify for club colors. You will need to complete payment before receiving club colors.",
        },
      ]);
    });

    it("asks a member in the grace period to renew", async () => {
      const rewards = await rewardsFor("c_robin", (seed) =>
        setField(seed, "c_robin", POINTS_FIELD_ID, "20"),
      );
      expect(rewards).toMatchObject([
        {
          message:
            "You qualify for club colors. You will need to renew before receiving club colors.",
        },
      ]);
    });

    it("asks a lapsed member to renew", async () => {
      const rewards = await rewardsFor("c_lee", (seed) =>
        setField(seed, "c_lee", POINTS_FIELD_ID, "20"),
      );
      expect(rewards).toMatchObject([
        {
          message:
            "You qualify for club colors. You will need to renew before receiving club colors.",
        },
      ]);
    });

    it("shows nothing when the issued field is unreadable", async () => {
      const rewards = await rewardsFor("c_taylor", (seed) =>
        setField(seed, "c_taylor", COLORS_ISSUED_FIELD_ID, "maybe"),
      );
      expect(rewards).toEqual([]);
    });

    it("shows nothing when the points total is unreadable", async () => {
      const rewards = await rewardsFor("c_taylor", (seed) =>
        setField(seed, "c_taylor", POINTS_FIELD_ID, "12.5"),
      );
      expect(rewards).toEqual([]);
    });
  });
});
