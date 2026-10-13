import { describe, expect, it } from "vitest";
import { POINTS_PER_CHECKIN } from "./points";

describe("POINTS_PER_CHECKIN", () => {
  it("awards 1 point per event for attendees and volunteers", () => {
    expect(POINTS_PER_CHECKIN.attendee).toBe(1);
    expect(POINTS_PER_CHECKIN.volunteer).toBe(1);
  });

  it("can't be changed at runtime", () => {
    expect(Object.isFrozen(POINTS_PER_CHECKIN)).toBe(true);
  });
});
