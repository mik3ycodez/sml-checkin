import { describe, expect, it } from "vitest";
import { TidyError } from "../tidyhq/errors";
import { MockTidyClient } from "../tidyhq/mock/MockTidyClient";
import { createSeed, type MockSeed } from "../tidyhq/mock/seed";
import type { Event } from "../tidyhq/types";
import { ADMIN_RECENT_DAYS, getAdminEvents } from "./events";

const NOW = new Date("2026-10-12T18:00:00Z");
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function clientWith(edit?: (seed: MockSeed) => void) {
  const seed = createSeed(NOW);
  edit?.(seed);
  return new MockTidyClient(seed, () => NOW);
}

function event(id: string, startOffsetMs: number, hours = 2): Event {
  const start = new Date(NOW.getTime() + startOffsetMs);
  return {
    id,
    name: id,
    start_at: start.toISOString(),
    end_at: new Date(start.getTime() + hours * HOUR_MS).toISOString(),
    body: null,
    location: null,
    public: true,
    archived: false,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
  };
}

describe("getAdminEvents", () => {
  it("splits the seed into upcoming (soonest first) and recent", async () => {
    const { upcoming, recent } = await getAdminEvents(clientWith(), {
      now: NOW,
    });
    expect(upcoming.map((e) => e.id)).toEqual([
      "ev_tonight", // in progress: ends after now
      "ev_bootblack_social",
      "ev_bar_night",
      "ev_leather_brunch",
    ]);
    // Pub Night was 30 days ago: outside the recent window.
    expect(recent).toEqual([]);
  });

  it("lists events that ended within the recent window, newest first", async () => {
    const client = clientWith((seed) => {
      seed.events.push(
        event("ev_old", -(ADMIN_RECENT_DAYS + 2) * DAY_MS),
        event("ev_last_week", -7 * DAY_MS),
        event("ev_yesterday", -DAY_MS),
      );
    });
    const { recent } = await getAdminEvents(client, { now: NOW });
    expect(recent.map((e) => e.id)).toEqual(["ev_yesterday", "ev_last_week"]);
  });

  it("keeps an event that has just ended in recent, not upcoming", async () => {
    const client = clientWith((seed) => {
      seed.events.push(event("ev_just_ended", -3 * HOUR_MS, 2));
    });
    const { upcoming, recent } = await getAdminEvents(client, { now: NOW });
    expect(upcoming.map((e) => e.id)).not.toContain("ev_just_ended");
    expect(recent.map((e) => e.id)).toContain("ev_just_ended");
  });

  it("marks whether each event has an attendance group", async () => {
    const client = clientWith((seed) => {
      seed.events.push(event("ev_no_group", DAY_MS));
    });
    const { upcoming } = await getAdminEvents(client, { now: NOW });
    expect(upcoming.find((e) => e.id === "ev_tonight")?.hasGroup).toBe(true);
    expect(upcoming.find((e) => e.id === "ev_no_group")?.hasGroup).toBe(false);
  });

  it("passes name, start and location through, and tolerates a missing name", async () => {
    const client = clientWith((seed) => {
      seed.events.push({ ...event("ev_unnamed", DAY_MS), name: null });
    });
    const { upcoming } = await getAdminEvents(client, { now: NOW });
    const pub = upcoming.find((e) => e.id === "ev_bar_night")!;
    expect(pub).toMatchObject({
      name: "Monthly Bar Night",
      location: "The Cuff Complex",
    });
    expect(Date.parse(pub.startAt)).not.toBeNaN();
    expect(upcoming.find((e) => e.id === "ev_unnamed")?.name).toBeNull();
  });

  it("skips events whose times can't be read instead of crashing", async () => {
    const client = clientWith((seed) => {
      seed.events.push({ ...event("ev_bad", DAY_MS), start_at: "soon" });
    });
    const { upcoming, recent } = await getAdminEvents(client, { now: NOW });
    expect([...upcoming, ...recent].map((e) => e.id)).not.toContain("ev_bad");
  });

  it("throws if TidyHQ can't list events, so the page can say so", async () => {
    const client = clientWith();
    client.listEvents = async () => {
      throw new TidyError(500, "boom");
    };
    await expect(getAdminEvents(client, { now: NOW })).rejects.toThrow("boom");
  });
});
