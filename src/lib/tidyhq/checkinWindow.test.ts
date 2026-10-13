import { describe, expect, it } from "vitest";
import {
  getCheckinWindow,
  isCheckinOpen,
  type CheckinWindow,
} from "./checkinWindow";
import { MockTidyClient } from "./mock/MockTidyClient";
import { createSeed } from "./mock/seed";

const NOW = new Date("2026-10-12T18:00:00Z");

function clientWith(edit: (seed: ReturnType<typeof createSeed>) => void) {
  const seed = createSeed(NOW);
  edit(seed);
  return new MockTidyClient(seed, () => NOW);
}

describe("getCheckinWindow", () => {
  it("uses the admin-set window when the event has one", async () => {
    const client = clientWith((seed) => {
      seed.checkinWindows.ev_pub_night = {
        opens_at: "2026-09-12T01:30:00.000Z",
        closes_at: "2026-09-12T04:00:00.000Z",
      };
    });
    const event = await client.getEvent("ev_pub_night");
    expect(await getCheckinWindow(client, event)).toEqual({
      opensAt: new Date("2026-09-12T01:30:00.000Z"),
      closesAt: new Date("2026-09-12T04:00:00.000Z"),
      source: "event",
    });
  });

  it("falls back to the event's start and end when no window is set", async () => {
    const client = new MockTidyClient(createSeed(NOW), () => NOW);
    const event = await client.getEvent("ev_bar_night");
    expect(await getCheckinWindow(client, event)).toEqual({
      opensAt: new Date(event.start_at!),
      closesAt: new Date(event.end_at!),
      source: "fallback",
    });
  });

  it("has no open or close time when the event has no window or dates", async () => {
    const client = clientWith((seed) => {
      const event = seed.events.find((e) => e.id === "ev_bar_night")!;
      event.start_at = null;
      event.end_at = null;
    });
    const event = await client.getEvent("ev_bar_night");
    const window = await getCheckinWindow(client, event);
    expect(window).toEqual({
      opensAt: null,
      closesAt: null,
      source: "fallback",
    });
    expect(isCheckinOpen(window, NOW)).toBe("closed");
  });

  it("treats an unparseable date as missing", async () => {
    const client = clientWith((seed) => {
      const event = seed.events.find((e) => e.id === "ev_bar_night")!;
      event.start_at = "not a date";
    });
    const event = await client.getEvent("ev_bar_night");
    const window = await getCheckinWindow(client, event);
    expect(window.opensAt).toBeNull();
    expect(isCheckinOpen(window, NOW)).toBe("closed");
  });
});

describe("isCheckinOpen", () => {
  const window: CheckinWindow = {
    opensAt: new Date("2026-10-12T17:00:00Z"),
    closesAt: new Date("2026-10-12T21:00:00Z"),
    source: "event",
  };

  it.each([
    ["before it opens", "2026-10-12T16:59:59Z", "not_yet"],
    ["exactly at open", "2026-10-12T17:00:00Z", "open"],
    ["while open", "2026-10-12T19:00:00Z", "open"],
    ["one second before close", "2026-10-12T20:59:59Z", "open"],
    ["exactly at close", "2026-10-12T21:00:00Z", "closed"],
    ["after it closes", "2026-10-12T23:00:00Z", "closed"],
  ])("is %s → %s", (_label, at, expected) => {
    expect(isCheckinOpen(window, new Date(at))).toBe(expected);
  });

  it("is closed when either end of the window is missing", () => {
    expect(isCheckinOpen({ ...window, opensAt: null }, NOW)).toBe("closed");
    expect(isCheckinOpen({ ...window, closesAt: null }, NOW)).toBe("closed");
  });
});
