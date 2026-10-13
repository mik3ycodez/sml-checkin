import { describe, expect, it } from "vitest";
import { MockTidyClient } from "../tidyhq/mock/MockTidyClient";
import { createSeed } from "../tidyhq/mock/seed";
import { checkIn } from "./checkIn";
import { getCheckinStatus } from "./checkinStatus";

const NOW = new Date("2026-10-12T18:00:00Z");

function seededClient(edit?: (seed: ReturnType<typeof createSeed>) => void) {
  const seed = createSeed(NOW);
  edit?.(seed);
  return new MockTidyClient(seed, () => NOW);
}

describe("getCheckinStatus", () => {
  it("reports a member who can check in now", async () => {
    const client = seededClient();
    const status = await getCheckinStatus(client, {
      eventId: "ev_tonight",
      contactId: "c_dante",
      now: NOW,
    });
    expect(status).toEqual({
      status: "ready",
      name: "Dante Ruiz",
      eventName: "Social Night",
    });
  });

  it("reports a check-in and the stored total, read back from TidyHQ", async () => {
    const client = seededClient();
    await checkIn(client, { eventId: "ev_tonight", contactId: "c_dante", now: NOW });
    const status = await getCheckinStatus(client, {
      eventId: "ev_tonight",
      contactId: "c_dante",
      now: NOW,
    });
    expect(status).toEqual({
      status: "checked_in",
      name: "Dante Ruiz",
      eventName: "Social Night",
      total: 1,
    });
  });

  it("reports an existing check-in after its window has closed", async () => {
    const client = seededClient();
    const status = await getCheckinStatus(client, {
      eventId: "ev_pub_night",
      contactId: "c_marcus",
      now: NOW,
    });
    expect(status).toMatchObject({ status: "checked_in", total: 1 });
  });

  it("reports an unreadable total as null", async () => {
    const client = seededClient((seed) => {
      const marcus = seed.contacts.find((c) => c.id === "c_marcus")!;
      marcus.custom_fields.cf_sml_points.value = "12.5";
    });
    const status = await getCheckinStatus(client, {
      eventId: "ev_pub_night",
      contactId: "c_marcus",
      now: NOW,
    });
    expect(status).toMatchObject({ status: "checked_in", total: null });
  });

  it("changes nothing in TidyHQ", async () => {
    const client = seededClient();
    await getCheckinStatus(client, {
      eventId: "ev_tonight",
      contactId: "c_dante",
      now: NOW,
    });
    const members = await client.listGroupContacts("grp_social_night");
    expect(members.map((c) => c.id)).not.toContain("c_dante");
  });

  it("reports an unknown contact (a stale session)", async () => {
    const client = seededClient();
    const status = await getCheckinStatus(client, {
      eventId: "ev_tonight",
      contactId: "c_nobody",
      now: NOW,
    });
    expect(status).toEqual({ status: "unknown_contact" });
  });

  it("reports an unknown event", async () => {
    const client = seededClient();
    const status = await getCheckinStatus(client, {
      eventId: "ev_nope",
      contactId: "c_dante",
      now: NOW,
    });
    expect(status).toEqual({ status: "unknown_event" });
  });

  it("explains that an expired membership can't check in", async () => {
    const status = await getCheckinStatus(seededClient(), {
      eventId: "ev_tonight",
      contactId: "c_lee",
      now: NOW,
    });
    expect(status).toEqual({
      status: "membership_inactive",
      name: "Lee Hart",
      eventName: "Social Night",
    });
  });

  it("explains that check-in hasn't opened, and when it will", async () => {
    const client = seededClient();
    const window = await client.getEventCheckinWindow("ev_bootblack_social");
    const status = await getCheckinStatus(client, {
      eventId: "ev_bootblack_social",
      contactId: "c_dante",
      now: NOW,
    });
    expect(status).toEqual({
      status: "not_open",
      name: "Dante Ruiz",
      eventName: "Bootblack Social",
      opensAt: new Date(window!.opens_at),
    });
  });

  it("explains that check-in has closed", async () => {
    const status = await getCheckinStatus(seededClient(), {
      eventId: "ev_pub_night",
      contactId: "c_dante",
      now: NOW,
    });
    expect(status).toEqual({
      status: "closed",
      name: "Dante Ruiz",
      eventName: "Pub Night",
    });
  });

  it("explains that an unreadable total stops check-in", async () => {
    const client = seededClient((seed) => {
      const marcus = seed.contacts.find((c) => c.id === "c_marcus")!;
      marcus.custom_fields.cf_sml_points.value = "12.5";
    });
    const status = await getCheckinStatus(client, {
      eventId: "ev_tonight",
      contactId: "c_marcus",
      now: NOW,
    });
    expect(status).toEqual({
      status: "points_unreadable",
      name: "Marcus Bell",
      eventName: "Social Night",
    });
  });

  it("agrees with checkIn about who may check in", async () => {
    // Every refusal the page shows before the tap is the one the tap gets.
    const cases = [
      { eventId: "ev_tonight", contactId: "c_dante" },
      { eventId: "ev_tonight", contactId: "c_lee" },
      { eventId: "ev_bootblack_social", contactId: "c_dante" },
      { eventId: "ev_pub_night", contactId: "c_dante" },
      { eventId: "ev_pub_night", contactId: "c_marcus" },
    ];
    for (const input of cases) {
      const client = seededClient();
      const status = await getCheckinStatus(client, { ...input, now: NOW });
      const result = await checkIn(client, { ...input, now: NOW });
      const expected =
        status.status === "ready"
          ? "checked_in"
          : status.status === "checked_in"
            ? "already_checked_in"
            : status.status;
      expect(result.status, JSON.stringify(input)).toBe(expected);
    }
  });
});
