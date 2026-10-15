import { describe, expect, it, vi } from "vitest";
import { TidyError } from "../tidyhq/errors";
import { MockTidyClient } from "../tidyhq/mock/MockTidyClient";
import { createSeed, type MockSeed } from "../tidyhq/mock/seed";
import type { Event } from "../tidyhq/types";
import { getRecentEvents, RECENT_EVENTS_DAYS } from "./recentEvents";

// Maps ev_extra_* events to one shared group, so a test can attend more
// events than the real mapping has.
vi.mock("../tidyhq/eventGroups", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../tidyhq/eventGroups")>();
  return {
    ...actual,
    findEventGroup: (event: { id: string }) =>
      event.id.startsWith("ev_extra_")
        ? "grp_extra"
        : actual.findEventGroup(event),
    resolveEventGroup: (event: { id: string }) =>
      event.id.startsWith("ev_extra_")
        ? "grp_extra"
        : actual.resolveEventGroup(event),
  };
});

const NOW = new Date("2026-10-12T18:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function seededClient(edit?: (seed: MockSeed) => void) {
  const seed = createSeed(NOW);
  edit?.(seed);
  return new MockTidyClient(seed, () => NOW);
}

/** An event `daysAgo` days back lasting two hours, mapped to `ev_*` ids in eventGroups. */
function pastEvent(id: string, daysAgo: number): Event {
  const start = new Date(NOW.getTime() - daysAgo * DAY_MS);
  return {
    id,
    name: id,
    start_at: start.toISOString(),
    end_at: new Date(start.getTime() + 2 * 60 * 60 * 1000).toISOString(),
    body: null,
    location: null,
    public: true,
    archived: false,
    created_at: start.toISOString(),
    updated_at: start.toISOString(),
  };
}

describe("getRecentEvents", () => {
  it("lists events the member attended", async () => {
    const result = await getRecentEvents(seededClient(), {
      contactId: "c_marcus",
      now: NOW,
    });
    expect(result).toEqual([
      expect.objectContaining({ id: "ev_pub_night", name: "Pub Night" }),
    ]);
    expect(typeof result[0].startAt).toBe("string");
  });

  it("skips events the member didn't attend", async () => {
    const result = await getRecentEvents(seededClient(), {
      contactId: "c_dante",
      now: NOW,
    });
    expect(result).toEqual([]);
  });

  it("skips future events even if the member is in the group", async () => {
    const client = seededClient((seed) => {
      seed.groupMembers.grp_bootblack_social = ["c_dante"];
    });
    const result = await getRecentEvents(client, {
      contactId: "c_dante",
      now: NOW,
    });
    expect(result).toEqual([]);
  });

  it("skips events older than RECENT_EVENTS_DAYS", async () => {
    expect(RECENT_EVENTS_DAYS).toBe(90);
    const client = seededClient((seed) => {
      seed.events = [
        pastEvent("ev_pub_night", RECENT_EVENTS_DAYS + 1),
        pastEvent("ev_bar_night", RECENT_EVENTS_DAYS - 1),
      ];
      seed.groupMembers.grp_pub_night = ["c_dante"];
      seed.groupMembers.grp_bar_night = ["c_dante"];
    });
    const result = await getRecentEvents(client, {
      contactId: "c_dante",
      now: NOW,
    });
    expect(result.map((e) => e.id)).toEqual(["ev_bar_night"]);
  });

  it("returns at most 5, newest first", async () => {
    const ids = [
      "ev_pub_night",
      "ev_tonight",
      "ev_bootblack_social",
      "ev_bar_night",
      "ev_leather_brunch",
    ];
    const groups = [
      "grp_pub_night",
      "grp_social_night",
      "grp_bootblack_social",
      "grp_bar_night",
      "grp_leather_brunch",
    ];
    const client = seededClient((seed) => {
      // Five mapped events, oldest first.
      seed.events = ids.map((id, i) => pastEvent(id, 50 - i * 10));
      for (const g of groups) seed.groupMembers[g] = ["c_dante"];
    });
    const result = await getRecentEvents(client, {
      contactId: "c_dante",
      now: NOW,
    });
    expect(result.map((e) => e.id)).toEqual([...ids].reverse());
  });

  it("caps the list at 5 when more were attended", async () => {
    const client = seededClient((seed) => {
      seed.events = Array.from({ length: 6 }, (_, i) =>
        pastEvent(`ev_extra_${i}`, 10 + i),
      );
      seed.groupMembers.grp_extra = ["c_dante"];
    });
    const result = await getRecentEvents(client, {
      contactId: "c_dante",
      now: NOW,
    });
    // ev_extra_0 is the newest (10 days ago); ev_extra_5 is dropped.
    expect(result.map((e) => e.id)).toEqual([
      "ev_extra_0",
      "ev_extra_1",
      "ev_extra_2",
      "ev_extra_3",
      "ev_extra_4",
    ]);
  });

  it("skips events with no attendance group", async () => {
    const client = seededClient((seed) => {
      seed.events.push(pastEvent("ev_unmapped", 3));
    });
    const result = await getRecentEvents(client, {
      contactId: "c_marcus",
      now: NOW,
    });
    expect(result.map((e) => e.id)).toEqual(["ev_pub_night"]);
  });

  it("fails when a group read fails", async () => {
    const client = seededClient();
    vi.spyOn(client, "listGroupContacts").mockRejectedValue(
      new TidyError(500, "boom"),
    );
    await expect(
      getRecentEvents(client, { contactId: "c_marcus", now: NOW }),
    ).rejects.toBeInstanceOf(TidyError);
  });
});
