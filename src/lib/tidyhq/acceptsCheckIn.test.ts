import { describe, expect, it } from "vitest";
import { acceptsCheckIn } from "./acceptsCheckIn";
import type { Event } from "./types";

const event = (change: Partial<Event> = {}): Event => ({
  id: "ev_1",
  name: "Night",
  start_at: "2026-11-01T02:00:00Z",
  end_at: "2026-11-01T05:00:00Z",
  body: null,
  location: null,
  public: true,
  archived: false,
  created_at: "",
  updated_at: "",
  ...change,
});

describe("acceptsCheckIn", () => {
  it("accepts an ordinary event", () => {
    expect(acceptsCheckIn(event())).toBe(true);
  });

  it("accepts a shared event, set by decision 5 of the milestone 5 plan", () => {
    expect(
      acceptsCheckIn(event({ shared_from: { id: "o_1", name: "Other Club" } })),
    ).toBe(true);
  });

  it("accepts a public or private event alike", () => {
    expect(acceptsCheckIn(event({ public: false }))).toBe(true);
  });
});
