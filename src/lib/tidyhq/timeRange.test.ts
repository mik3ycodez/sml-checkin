import { describe, expect, it } from "vitest";
import { parseTime, validRange } from "./timeRange";

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
