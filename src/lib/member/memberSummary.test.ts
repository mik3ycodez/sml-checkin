import { describe, expect, it } from "vitest";
import { POINTS_FIELD_ID } from "../tidyhq/customFields";
import { MockTidyClient } from "../tidyhq/mock/MockTidyClient";
import { createSeed, type MockSeed } from "../tidyhq/mock/seed";
import type { Membership } from "../tidyhq/types";
import { getMemberSummary } from "./memberSummary";

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
      points: 0,
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
      membershipEndsOn: "2026-09-02",
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
          end_date: "2026-09-01",
        }),
      ];
    });
    const result = await getMemberSummary(client, {
      contactId: "c_lee",
      now: NOW,
    });
    expect(result).toMatchObject({
      level: "Associate Member",
      membershipEndsOn: "2026-09-01",
      membership: "expired",
    });
  });

  it("has no level and counts as expired with no memberships at all", async () => {
    const client = seededClient((seed) => {
      seed.memberships = [];
    });
    const result = await getMemberSummary(client, {
      contactId: "c_dante",
      now: NOW,
    });
    expect(result).toEqual({
      status: "ok",
      name: "Dante Ruiz",
      level: null,
      membershipEndsOn: null,
      membership: "expired",
      points: 0,
    });
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

  it("changes nothing in TidyHQ", async () => {
    const client = seededClient();
    const before = JSON.stringify(await client.getContact("c_sam"));
    await getMemberSummary(client, { contactId: "c_sam", now: NOW });
    expect(JSON.stringify(await client.getContact("c_sam"))).toBe(before);
  });
});
