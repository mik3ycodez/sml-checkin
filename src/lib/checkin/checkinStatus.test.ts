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
  it("reports a member who isn't checked in yet", async () => {
    const client = seededClient();
    const status = await getCheckinStatus(client, {
      eventId: "ev_tonight",
      contactId: "c_dante",
    });
    expect(status).toEqual({
      status: "not_checked_in",
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
    });
    expect(status).toMatchObject({ status: "checked_in", total: null });
  });

  it("changes nothing in TidyHQ", async () => {
    const client = seededClient();
    await getCheckinStatus(client, { eventId: "ev_tonight", contactId: "c_dante" });
    const members = await client.listGroupContacts("grp_social_night");
    expect(members.map((c) => c.id)).not.toContain("c_dante");
  });

  it("reports an unknown event", async () => {
    const client = seededClient();
    const status = await getCheckinStatus(client, {
      eventId: "ev_nope",
      contactId: "c_dante",
    });
    expect(status).toEqual({ status: "unknown_event" });
  });
});
