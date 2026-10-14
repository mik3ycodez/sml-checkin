import { describe, expect, it } from "vitest";
import { POINTS_PER_CHECKIN } from "./points";

describe("POINTS_PER_CHECKIN", () => {
  it("awards 1 point per event", () => {
    expect(POINTS_PER_CHECKIN).toBe(1);
  });
});
