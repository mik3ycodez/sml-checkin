import { describe, expect, it } from "vitest";
import { sortEventsByStart } from "./eventOrder";
import type { Event } from "./types";

const event = (id: string, start_at: string | null) =>
  ({ id, start_at }) as Event;

describe("sortEventsByStart", () => {
  it("sorts by the moment of the start, not the text", () => {
    const sorted = sortEventsByStart([
      event("later", "2026-11-20T10:00:00-08:00"), // 18:00Z
      event("earlier", "2026-11-20T17:30:00Z"),
    ]);
    expect(sorted.map((e) => e.id)).toEqual(["earlier", "later"]);
  });

  it("puts events with no readable start last, in their given order", () => {
    const sorted = sortEventsByStart([
      event("none", null),
      event("junk", "Oct 17 18:30"),
      event("ok", "2026-11-20T17:30:00Z"),
    ]);
    expect(sorted.map((e) => e.id)).toEqual(["ok", "none", "junk"]);
  });

  it("keeps the order of events that start together", () => {
    const same = "2026-11-20T17:30:00Z";
    const sorted = sortEventsByStart([event("a", same), event("b", same)]);
    expect(sorted.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("leaves the list it was given alone", () => {
    const list = [
      event("b", "2026-11-21T00:00:00Z"),
      event("a", "2026-11-20T00:00:00Z"),
    ];
    sortEventsByStart(list);
    expect(list.map((e) => e.id)).toEqual(["b", "a"]);
  });
});
