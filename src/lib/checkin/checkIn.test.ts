import { describe, expect, it } from "vitest";
import { readPoints } from "../tidyhq/customFields";
import { TidyError } from "../tidyhq/errors";
import { MockTidyClient } from "../tidyhq/mock/MockTidyClient";
import { createSeed } from "../tidyhq/mock/seed";
import { checkIn, findContact } from "./checkIn";

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
    });
    expect(await groupIds(client, "grp_social_night")).not.toContain("c_marcus");
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
    await expect(checkIn(client, input)).rejects.toBeInstanceOf(TidyError);
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
    await expect(checkIn(client, input)).rejects.toBeInstanceOf(TidyError);
    expect(await storedPoints(client, "c_dante")).toBe(0);
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

  it("reports an unknown contact (a stale session) without writing anything", async () => {
    const client = seededClient();
    const result = await checkIn(client, {
      eventId: "ev_tonight",
      contactId: "c_nobody",
      now: NOW,
    });
    expect(result).toEqual({ status: "unknown_contact" });
    expect(await groupIds(client, "grp_social_night")).not.toContain("c_nobody");
  });
});

describe("findContact", () => {
  it("returns the contact", async () => {
    const contact = await findContact(seededClient(), "c_dante");
    expect(contact?.display_name).toBe("Dante Ruiz");
  });

  it("returns null for a contact TidyHQ doesn't have", async () => {
    expect(await findContact(seededClient(), "c_nobody")).toBeNull();
  });

  it("lets other TidyHQ errors through", async () => {
    const client = seededClient();
    client.getContact = async () => {
      throw new TidyError(503, "TidyHQ unavailable");
    };
    await expect(findContact(client, "c_dante")).rejects.toBeInstanceOf(TidyError);
  });
});
