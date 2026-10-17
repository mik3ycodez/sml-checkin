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
    findEventGroup: (event: Pick<Event, "id" | "attendance_group_id">) =>
      event.id.startsWith("ev_extra_")
        ? "grp_extra"
        : actual.findEventGroup(event),
  };
});

const NOW = new Date("2026-10-12T18:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function seededClient(edit?: (seed: MockSeed) => void) {
  const seed = createSeed(NOW);
  edit?.(seed);
  return new MockTidyClient(seed, () => NOW);
}

/** An event with exact timestamps, mapped like `pastEvent`'s. */
function eventAt(id: string, startAt: string, endAt: string): Event {
  return { ...pastEvent(id, 1), start_at: startAt, end_at: endAt };
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
    attendance_group_id: `grp_${id.slice("ev_".length)}`,
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

  it("includes an event later today that the member checked into early", async () => {
    // 02:00 UTC tomorrow is 7pm tonight in Seattle; NOW is 11am.
    const client = seededClient((seed) => {
      seed.events = [
        eventAt(
          "ev_bootblack_social",
          "2026-10-13T02:00:00Z",
          "2026-10-13T05:00:00Z",
        ),
      ];
      seed.groupMembers.grp_bootblack_social = ["c_dante"];
    });
    const result = await getRecentEvents(client, {
      contactId: "c_dante",
      now: NOW,
    });
    expect(result.map((e) => e.id)).toEqual(["ev_bootblack_social"]);
  });

  it("skips an event that starts tomorrow, even if the member is in its group", async () => {
    // 07:00 UTC on the 13th is midnight Seattle: the first moment of tomorrow.
    const client = seededClient((seed) => {
      seed.events = [
        eventAt(
          "ev_bootblack_social",
          "2026-10-13T07:00:00Z",
          "2026-10-13T10:00:00Z",
        ),
      ];
      seed.groupMembers.grp_bootblack_social = ["c_dante"];
    });
    const result = await getRecentEvents(client, {
      contactId: "c_dante",
      now: NOW,
    });
    expect(result).toEqual([]);
  });

  it("orders by moment, not by timestamp text, when offsets differ", async () => {
    // Text order puts "…T01:00:00Z" on the 11th after "…T19:00:00-07:00" on
    // the 10th, but the first is really the earlier moment (the 10th's is
    // 02:00Z on the 11th).
    const client = seededClient((seed) => {
      seed.events = [
        eventAt("ev_pub_night", "2026-10-11T01:00:00Z", "2026-10-11T03:00:00Z"),
        eventAt(
          "ev_bar_night",
          "2026-10-10T19:00:00-07:00",
          "2026-10-10T22:00:00-07:00",
        ),
      ];
      seed.groupMembers.grp_pub_night = ["c_dante"];
      seed.groupMembers.grp_bar_night = ["c_dante"];
    });
    const result = await getRecentEvents(client, {
      contactId: "c_dante",
      now: NOW,
    });
    expect(result.map((e) => e.id)).toEqual(["ev_bar_night", "ev_pub_night"]);
  });

  it("measures the 90 days in Seattle calendar days, across a clock change", async () => {
    // Seattle today is 2026-03-20 (PDT). 90 days back is 2025-12-20, which is
    // PST, so its midnight is 08:00Z. An event ending at 08:30Z that day is
    // inside the window, though it's more than 90 x 24 hours before `now`.
    const now = new Date("2026-03-20T18:00:00Z");
    const seed = createSeed(now);
    seed.events = [
      eventAt("ev_pub_night", "2025-12-20T06:00:00Z", "2025-12-20T08:30:00Z"),
    ];
    seed.groupMembers.grp_pub_night = ["c_dante"];
    const client = new MockTidyClient(seed, () => now);
    const result = await getRecentEvents(client, {
      contactId: "c_dante",
      now,
    });
    expect(result.map((e) => e.id)).toEqual(["ev_pub_night"]);
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
      seed.events = ids.map((id, i) => ({
        ...pastEvent(id, 50 - i * 10),
        attendance_group_id: groups[i],
      }));
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
      seed.groups.push({
        id: "grp_extra",
        label: "Attendees: Extra",
        description: "",
        size: 1,
        created_at: "2026-01-01T00:00:00Z",
      });
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

  it("includes today's event, whose group isn't archived", async () => {
    const client = seededClient((seed) => {
      seed.groupMembers.grp_social_night = ["c_dante"];
    });
    const result = await getRecentEvents(client, {
      contactId: "c_dante",
      now: NOW,
    });
    expect(result.map((e) => e.id)).toEqual(["ev_tonight"]);
  });

  it("never lists non-event groups", async () => {
    // Marcus is in Members and Volunteers as well as Pub Night's group.
    const client = seededClient();
    const groups = await client.listContactGroups("c_marcus");
    expect(groups.map((g) => g.id)).toContain("grp_volunteers");
    const result = await getRecentEvents(client, {
      contactId: "c_marcus",
      now: NOW,
    });
    expect(result.map((e) => e.id)).toEqual(["ev_pub_night"]);
  });

  it("makes one groups request and one events request, no group reads", async () => {
    const client = seededClient();
    const listEvents = vi.spyOn(client, "listEvents");
    const listContactGroups = vi.spyOn(client, "listContactGroups");
    const listGroupContacts = vi.spyOn(client, "listGroupContacts");
    await getRecentEvents(client, { contactId: "c_marcus", now: NOW });
    expect(listEvents).toHaveBeenCalledTimes(1);
    expect(listContactGroups).toHaveBeenCalledTimes(1);
    expect(listGroupContacts).not.toHaveBeenCalled();
  });

  it("skips an event whose start time can't be parsed", async () => {
    const client = seededClient();
    const events = await client.listEvents();
    vi.spyOn(client, "listEvents").mockResolvedValue([
      ...events,
      eventAt("ev_extra_bad_date", "not-a-date", "2026-10-12T18:00:00Z"),
    ]);
    vi.spyOn(client, "listContactGroups").mockResolvedValue([
      { id: "grp_pub_night" },
      { id: "grp_extra" },
    ] as Awaited<ReturnType<typeof client.listContactGroups>>);
    const result = await getRecentEvents(client, {
      contactId: "c_marcus",
      now: NOW,
    });
    expect(result.map((e) => e.id)).not.toContain("ev_extra_bad_date");
    expect(result.map((e) => e.name)).toEqual(["Pub Night"]);
  });

  it("fails when the groups read fails", async () => {
    const client = seededClient();
    vi.spyOn(client, "listContactGroups").mockRejectedValue(
      new TidyError(500, "boom"),
    );
    await expect(
      getRecentEvents(client, { contactId: "c_marcus", now: NOW }),
    ).rejects.toBeInstanceOf(TidyError);
  });
});
