import { describe, expect, it } from "vitest";
import {
  checkinBlocker,
  getCheckinWindow,
  getCheckinWindowDetails,
  resolveCheckinWindow,
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

describe("getCheckinWindow with an invalid admin window", () => {
  it.each([
    ["a blank open time", { opens_at: "", closes_at: "2026-10-13T04:00:00Z" }],
    [
      "an unparseable close time",
      { opens_at: "2026-10-12T17:00:00Z", closes_at: "7pm" },
    ],
    [
      "a close time before the open time",
      { opens_at: "2026-10-12T21:00:00Z", closes_at: "2026-10-12T17:00:00Z" },
    ],
    [
      "a close time equal to the open time",
      { opens_at: "2026-10-12T17:00:00Z", closes_at: "2026-10-12T17:00:00Z" },
    ],
  ])("falls back to the event's start and end for %s", async (_label, bad) => {
    const client = clientWith((seed) => {
      seed.checkinWindows.ev_pub_night = bad;
    });
    const event = await client.getEvent("ev_pub_night");
    expect(await getCheckinWindow(client, event)).toEqual({
      opensAt: new Date(event.start_at!),
      closesAt: new Date(event.end_at!),
      source: "fallback",
    });
  });

  it("is closed when the event's own start and end are inverted too", async () => {
    const client = clientWith((seed) => {
      const event = seed.events.find((e) => e.id === "ev_bar_night")!;
      [event.start_at, event.end_at] = [event.end_at, event.start_at];
    });
    const event = await client.getEvent("ev_bar_night");
    const window = await getCheckinWindow(client, event);
    expect(window).toEqual({
      opensAt: null,
      closesAt: null,
      source: "fallback",
    });
  });
});

describe("getCheckinWindowDetails", () => {
  it("has nothing ignored for a valid admin window", async () => {
    const client = clientWith((seed) => {
      seed.checkinWindows.ev_pub_night = {
        opens_at: "2026-09-12T01:30:00.000Z",
        closes_at: "2026-09-12T04:00:00.000Z",
      };
    });
    const event = await client.getEvent("ev_pub_night");
    const details = await getCheckinWindowDetails(client, event);
    expect(details.ignored).toBeNull();
    expect(details.window.source).toBe("event");
  });

  it("has nothing ignored when no window is set, or both times are blank", async () => {
    const client = clientWith((seed) => {
      seed.checkinWindows.ev_pub_night = { opens_at: "", closes_at: "" };
    });
    for (const id of ["ev_pub_night", "ev_bar_night"]) {
      const event = await client.getEvent(id);
      const details = await getCheckinWindowDetails(client, event);
      expect(details.ignored).toBeNull();
      expect(details.window.source).toBe("fallback");
    }
  });

  it.each([
    ["half_filled", { opens_at: "", closes_at: "2026-10-13T04:00:00Z" }],
    ["unparseable", { opens_at: "2026-10-12T17:00:00Z", closes_at: "7pm" }],
    [
      "backwards",
      { opens_at: "2026-10-12T21:00:00Z", closes_at: "2026-10-12T17:00:00Z" },
    ],
  ])("says why a %s window was ignored", async (reason, bad) => {
    const client = clientWith((seed) => {
      seed.checkinWindows.ev_pub_night = bad;
    });
    const event = await client.getEvent("ev_pub_night");
    const details = await getCheckinWindowDetails(client, event);
    expect(details.ignored).toBe(reason);
    // The same window getCheckinWindow gives, so the page and check-in agree.
    expect(details.window).toEqual(await getCheckinWindow(client, event));
    expect(details.window.source).toBe("fallback");
  });
});

describe("resolveCheckinWindow", () => {
  const EVENT = {
    start_at: "2026-10-12T19:00:00Z",
    end_at: "2026-10-12T22:00:00Z",
  };

  it("is the same rule getCheckinWindowDetails applies, given the window it read", () => {
    expect(
      resolveCheckinWindow(
        { opens_at: "2026-10-12T18:00:00Z", closes_at: "2026-10-12T21:00:00Z" },
        EVENT,
      ),
    ).toEqual({
      window: {
        opensAt: new Date("2026-10-12T18:00:00Z"),
        closesAt: new Date("2026-10-12T21:00:00Z"),
        source: "event",
      },
      ignored: null,
    });
    expect(
      resolveCheckinWindow({ opens_at: "6pm", closes_at: "" }, EVENT),
    ).toEqual({
      window: {
        opensAt: new Date(EVENT.start_at),
        closesAt: new Date(EVENT.end_at),
        source: "fallback",
      },
      ignored: "half_filled",
    });
    expect(resolveCheckinWindow(null, EVENT).ignored).toBeNull();
  });

  it("ignores a window whose times are only spaces, without a warning", () => {
    expect(
      resolveCheckinWindow({ opens_at: " ", closes_at: " " }, EVENT).ignored,
    ).toBeNull();
  });

  it("ignores a window typed without a year or offset, and says it's unparseable", () => {
    const resolved = resolveCheckinWindow(
      { opens_at: "Oct 12 18:00", closes_at: "Oct 12 21:00" },
      EVENT,
    );
    expect(resolved.ignored).toBe("unparseable");
    expect(resolved.window.source).toBe("fallback");
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

  it("is closed, not 'not yet', when the window closes before it opens", () => {
    const inverted = {
      ...window,
      opensAt: window.closesAt,
      closesAt: window.opensAt,
    };
    expect(isCheckinOpen(inverted, new Date("2026-10-12T16:00:00Z"))).toBe(
      "closed",
    );
  });

  it("is closed when either end of the window is missing", () => {
    expect(isCheckinOpen({ ...window, opensAt: null }, NOW)).toBe("closed");
    expect(isCheckinOpen({ ...window, closesAt: null }, NOW)).toBe("closed");
  });
});

describe("checkinBlocker", () => {
  const window = {
    opensAt: new Date("2026-10-17T01:30:00Z"),
    closesAt: new Date("2026-10-17T04:00:00Z"),
    source: "event",
  } as const;
  const event = {
    id: "ev_tonight",
    archived: false,
    attendance_group_id: "grp_tonight",
  };

  it("is null for an event members can check in to", () => {
    expect(checkinBlocker(event, window)).toBeNull();
  });
  it("names the first reason: archived, then no group, then never opens", () => {
    expect(checkinBlocker({ ...event, archived: true }, window)).toBe(
      "archived",
    );
    expect(
      checkinBlocker(
        { id: "ev_x", archived: true, attendance_group_id: null },
        window,
      ),
    ).toBe("archived");
    expect(
      checkinBlocker(
        { id: "ev_x", archived: false, attendance_group_id: null },
        window,
      ),
    ).toBe("no_group");
    expect(
      checkinBlocker(event, {
        opensAt: null,
        closesAt: null,
        source: "fallback",
      }),
    ).toBe("never_opens");
  });
});
