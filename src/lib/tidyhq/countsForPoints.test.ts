import { describe, expect, it } from "vitest";
import { countsForPoints } from "./countsForPoints";
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

describe("countsForPoints", () => {
  it("counts an ordinary event", () => {
    expect(countsForPoints(event())).toBe(true);
  });

  it("counts a shared event, set by decision 5 of the milestone 5 plan", () => {
    expect(
      countsForPoints(
        event({ shared_from: { id: "o_1", name: "Other Club" } }),
      ),
    ).toBe(true);
  });

  it("counts a public or private event alike", () => {
    expect(countsForPoints(event({ public: false }))).toBe(true);
  });
});
