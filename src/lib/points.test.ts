import { describe, expect, it } from "vitest";
import { calculatePointsTotal, POINTS_PER_CHECKIN } from "./points";

describe("POINTS_PER_CHECKIN", () => {
  it("awards 1 point per event for attendees and volunteers", () => {
    expect(POINTS_PER_CHECKIN.attendee).toBe(1);
    expect(POINTS_PER_CHECKIN.volunteer).toBe(1);
  });

  it("can't be changed at runtime", () => {
    expect(Object.isFrozen(POINTS_PER_CHECKIN)).toBe(true);
  });
});

describe("calculatePointsTotal", () => {
  it("is 0 with no attendance", () => {
    expect(calculatePointsTotal([])).toBe(0);
  });

  it("sums points for every check-in by role", () => {
    expect(
      calculatePointsTotal([
        { eventId: "ev_a", role: "attendee" },
        { eventId: "ev_b", role: "volunteer" },
        { eventId: "ev_c", role: "attendee" },
      ]),
    ).toBe(3);
  });

  it("never resets: counts every event ever attended, however old", () => {
    const tenYearsOfMonthlyEvents = Array.from({ length: 120 }, (_, i) => ({
      eventId: `ev_${i}`,
      role: "attendee" as const,
    }));
    expect(calculatePointsTotal(tenYearsOfMonthlyEvents)).toBe(120);
  });

  it("counts each event once, even if it appears more than once", () => {
    expect(
      calculatePointsTotal([
        { eventId: "ev_a", role: "attendee" },
        { eventId: "ev_a", role: "attendee" },
        { eventId: "ev_b", role: "attendee" },
      ]),
    ).toBe(2);
  });
});
