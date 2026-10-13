import { describe, expect, it } from "vitest";
import { readPoints } from "../tidyhq/customFields";
import { TidyError } from "../tidyhq/errors";
import { MockTidyClient } from "../tidyhq/mock/MockTidyClient";
import { createSeed } from "../tidyhq/mock/seed";
import { checkIn } from "./checkIn";

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
    });
    expect(await groupIds(client, "grp_social_night")).toContain("c_dante");
    expect(await storedPoints(client, "c_dante")).toBe(1);
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

  it("awards volunteer points for a volunteer check-in", async () => {
    const client = seededClient();
    const result = await checkIn(client, {
      eventId: "ev_tonight",
      contactId: "c_dante",
      role: "volunteer",
      method: "staff",
      now: NOW,
    });
    expect(result).toMatchObject({ status: "checked_in", pointsAwarded: 1 });
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
      total: 1,
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

  it("corrects a stale points field on check-in", async () => {
    const client = seededClient((seed) => {
      const marcus = seed.contacts.find((c) => c.id === "c_marcus")!;
      marcus.custom_fields.cf_sml_points.value = "5";
    });
    const result = await checkIn(client, {
      eventId: "ev_tonight",
      contactId: "c_marcus",
      now: NOW,
    });
    expect(result).toMatchObject({ status: "checked_in", total: 2 });
    expect(await storedPoints(client, "c_marcus")).toBe(2);
  });

  it("corrects a stale points field when already checked in", async () => {
    // e.g. an earlier attempt added the member to the group, then failed
    // before writing points. The retry must finish the job.
    const client = seededClient();
    await client.addContactToGroup("grp_social_night", "c_dante");
    const result = await checkIn(client, {
      eventId: "ev_tonight",
      contactId: "c_dante",
      now: NOW,
    });
    expect(result).toMatchObject({ status: "already_checked_in", total: 1 });
    expect(await storedPoints(client, "c_dante")).toBe(1);
  });

  it("refuses a member whose membership has expired", async () => {
    const client = seededClient();
    const result = await checkIn(client, {
      eventId: "ev_tonight",
      contactId: "c_lee",
      now: NOW,
    });
    expect(result).toEqual({ status: "membership_inactive", name: "Lee Hart" });
    expect(await groupIds(client, "grp_social_night")).not.toContain("c_lee");
    expect(await storedPoints(client, "c_lee")).toBe(0);
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
      seed.events.push({ ...tonight, id: "ev_unmapped" });
    });
    const result = await checkIn(client, {
      eventId: "ev_unmapped",
      contactId: "c_dante",
      now: NOW,
    });
    expect(result).toEqual({ status: "unknown_event" });
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
      eventName: "Bootblack Social",
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
    expect(result).toEqual({ status: "closed", eventName: "Pub Night" });
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

  it("lets unexpected TidyHQ errors through", async () => {
    const client = seededClient();
    const error = await checkIn(client, {
      eventId: "ev_tonight",
      contactId: "c_nobody",
      now: NOW,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TidyError);
    expect((error as TidyError).status).toBe(404);
  });
});
