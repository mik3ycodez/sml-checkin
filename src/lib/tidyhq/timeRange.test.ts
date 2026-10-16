import { describe, expect, it } from "vitest";
import { parseTime, rangeProblem, validRange } from "./timeRange";

describe("parseTime", () => {
  it("parses a timestamp", () => {
    expect(parseTime("2026-10-12T18:00:00Z")).toEqual(
      new Date("2026-10-12T18:00:00Z"),
    );
  });

  it("returns null for missing, empty, or unreadable values", () => {
    expect(parseTime(null)).toBeNull();
    expect(parseTime("")).toBeNull();
    expect(parseTime("soon")).toBeNull();
  });
});

describe("validRange", () => {
  it("returns both times when the second is after the first", () => {
    expect(validRange("2026-10-12T18:00:00Z", "2026-10-12T20:00:00Z")).toEqual({
      opensAt: new Date("2026-10-12T18:00:00Z"),
      closesAt: new Date("2026-10-12T20:00:00Z"),
    });
  });

  it("returns null if either is unreadable, or the end isn't after the start", () => {
    expect(validRange(null, "2026-10-12T20:00:00Z")).toBeNull();
    expect(validRange("2026-10-12T18:00:00Z", "nope")).toBeNull();
    expect(
      validRange("2026-10-12T20:00:00Z", "2026-10-12T18:00:00Z"),
    ).toBeNull();
    expect(
      validRange("2026-10-12T18:00:00Z", "2026-10-12T18:00:00Z"),
    ).toBeNull();
  });
});

describe("rangeProblem", () => {
  const OPEN = "2026-10-12T18:00:00Z";
  const CLOSE = "2026-10-12T20:00:00Z";

  it("is null for a valid range", () => {
    expect(rangeProblem(OPEN, CLOSE)).toBeNull();
  });

  it("says nothing is set when both times are missing or blank", () => {
    expect(rangeProblem(null, null)).toBe("not_set");
    expect(rangeProblem("", "")).toBe("not_set");
    expect(rangeProblem("", null)).toBe("not_set");
  });

  it("calls a range with only one time given half-filled", () => {
    expect(rangeProblem(OPEN, "")).toBe("half_filled");
    expect(rangeProblem(null, CLOSE)).toBe("half_filled");
    // Even if the one that is given can't be read: the other is still missing.
    expect(rangeProblem("soon", null)).toBe("half_filled");
  });

  it("calls a time that can't be read unparseable", () => {
    expect(rangeProblem(OPEN, "7pm")).toBe("unparseable");
    expect(rangeProblem("later", CLOSE)).toBe("unparseable");
  });

  it("calls a close that isn't after the open backwards", () => {
    expect(rangeProblem(CLOSE, OPEN)).toBe("backwards");
    expect(rangeProblem(OPEN, OPEN)).toBe("backwards");
  });

  it("agrees with validRange: a problem exactly when the range isn't valid", () => {
    const times = [null, "", " ", "x", OPEN, CLOSE];
    for (const a of times) {
      for (const b of times) {
        expect(rangeProblem(a, b) === null).toBe(validRange(a, b) !== null);
      }
    }
  });
});
