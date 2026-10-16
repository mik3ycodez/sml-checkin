import { describe, expect, it } from "vitest";
import { parseTime, rangeProblem, validRange } from "./timeRange";

describe("parseTime", () => {
  it("parses a timestamp", () => {
    expect(parseTime("2026-10-12T18:00:00Z")).toEqual(
      new Date("2026-10-12T18:00:00Z"),
    );
  });

  it("accepts ISO 8601 with Z or an explicit offset, with or without fractions", () => {
    for (const ok of [
      "2026-10-12T18:00:00Z",
      "2026-10-12T11:00:00-07:00",
      "2026-10-12T11:00:00-0700",
      "2026-10-12T18:00:00+00:00",
      "2026-10-12T18:00Z",
    ]) {
      expect(parseTime(ok), ok).toEqual(new Date("2026-10-12T18:00:00Z"));
    }
    expect(parseTime("2026-10-12T18:00:00.250Z")!.getTime()).toBe(
      new Date("2026-10-12T18:00:00Z").getTime() + 250,
    );
  });

  it("ignores spaces around a time", () => {
    expect(parseTime("  2026-10-12T18:00:00Z ")).toEqual(
      new Date("2026-10-12T18:00:00Z"),
    );
  });

  it("rejects anything that isn't ISO 8601 with an explicit offset, so a typo can't pass as another time", () => {
    for (const bad of [
      "Oct 17 18:30", // the engine would read this as the year 2001
      "October 17, 2026 6:30 PM",
      "10/17/2026",
      "2026-10-17", // a date, not a moment
      "2026-10-17T18:30:00", // no offset: whose clock?
      "2026-10-17 18:30:00Z", // space, not T
      "2026-10-17T18:30:00 PM",
      "2026-13-17T18:30:00Z", // no 13th month
      "2026-02-30T18:30:00Z", // no Feb 30th
      "2026-10-17T25:00:00Z",
      "1760725800000",
      "7pm",
    ]) {
      expect(parseTime(bad), bad).toBeNull();
    }
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

  it("counts a time that's only spaces as blank", () => {
    expect(rangeProblem(" ", "")).toBe("not_set");
    expect(rangeProblem("  ", " ")).toBe("not_set");
    expect(rangeProblem(" ", CLOSE)).toBe("half_filled");
    expect(rangeProblem(OPEN, "   ")).toBe("half_filled");
    expect(rangeProblem(` ${OPEN} `, ` ${CLOSE} `)).toBeNull();
  });

  it("calls a time typed without a year or offset unparseable", () => {
    expect(rangeProblem("Oct 17 18:30", "Oct 17 21:00")).toBe("unparseable");
    expect(rangeProblem("2026-10-17T18:30:00", CLOSE)).toBe("unparseable");
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
    const times = [null, "", " ", "x", "Oct 17 18:30", OPEN, CLOSE];
    for (const a of times) {
      for (const b of times) {
        expect(rangeProblem(a, b) === null).toBe(validRange(a, b) !== null);
      }
    }
  });
});
