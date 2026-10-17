// check-in and the admin event list must both ask `countsForPoints`, not
// decide for themselves: this swaps its answer and watches them follow.

import { describe, expect, it, vi } from "vitest";
import { getAdminEvents } from "./admin/events";
import { assessCheckIn } from "./checkin/checkIn";
import { countsForPoints } from "./tidyhq/countsForPoints";
import { MockTidyClient } from "./tidyhq/mock/MockTidyClient";
import { createSeed } from "./tidyhq/mock/seed";

vi.mock("./tidyhq/countsForPoints", () => ({
  countsForPoints: vi.fn(() => true),
}));

const NOW = new Date("2026-10-12T18:00:00Z");
const client = () => new MockTidyClient(createSeed(NOW), () => NOW);
const ask = { eventId: "ev_tonight", contactId: "c_marcus", now: NOW };

describe("countsForPoints callers", () => {
  it("check-in goes ahead for an event that counts", async () => {
    vi.mocked(countsForPoints).mockReturnValue(true);
    expect(await assessCheckIn(client(), ask)).toMatchObject({
      status: "ready",
    });
  });

  it("check-in refuses an event that doesn't, as unavailable", async () => {
    vi.mocked(countsForPoints).mockReturnValue(false);
    expect(await assessCheckIn(client(), ask)).toMatchObject({
      status: "event_unavailable",
    });
  });

  it("the admin event list carries its answer for each event", async () => {
    vi.mocked(countsForPoints).mockReturnValue(true);
    const yes = await getAdminEvents(client(), { now: NOW });
    expect(
      [...yes.upcoming, ...yes.recent].every((e) => e.countsForPoints),
    ).toBe(true);
    vi.mocked(countsForPoints).mockImplementation((e) => e.id !== "ev_tonight");
    const some = await getAdminEvents(client(), { now: NOW });
    const all = [...some.upcoming, ...some.recent];
    expect(all.find((e) => e.id === "ev_tonight")!.countsForPoints).toBe(false);
    expect(
      all.filter((e) => e.id !== "ev_tonight").every((e) => e.countsForPoints),
    ).toBe(true);
  });
});
