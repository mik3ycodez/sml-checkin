import { describe, expect, it } from "vitest";
import { calculatePointsTotal, POINTS_PER_CHECKIN } from "./points";

describe("POINTS_PER_CHECKIN", () => {
  it("awards 1 point per event for attendees and volunteers", () => {
    expect(POINTS_PER_CHECKIN.attendee).toBe(1);
    expect(POINTS_PER_CHECKIN.volunteer).toBe(1);
  });
});

describe("calculatePointsTotal", () => {
  it("is 0 with no attendance", () => {
    expect(calculatePointsTotal([])).toBe(0);
  });

  it("sums points for every check-in by role", () => {
    expect(
      calculatePointsTotal([
        { role: "attendee" },
        { role: "volunteer" },
        { role: "attendee" },
      ]),
    ).toBe(3);
  });

  it("never resets: counts every event ever attended, however old", () => {
    const tenYearsOfMonthlyEvents = Array.from({ length: 120 }, () => ({
      role: "attendee" as const,
    }));
    expect(calculatePointsTotal(tenYearsOfMonthlyEvents)).toBe(120);
  });
});
