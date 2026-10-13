import { describe, expect, it } from "vitest";
import { addDays, seattleDate, seattleTimeLabel } from "./dates";

describe("seattleDate", () => {
  it("returns the Seattle calendar date as YYYY-MM-DD", () => {
    // 18:00 UTC is 11am in Seattle.
    expect(seattleDate(new Date("2026-10-12T18:00:00Z"))).toBe("2026-10-12");
  });

  it("stays on the Seattle date after the UTC date rolls over", () => {
    // 05:00 UTC on the 13th is 10pm on the 12th in Seattle (PDT).
    expect(seattleDate(new Date("2026-10-13T05:00:00Z"))).toBe("2026-10-12");
  });

  it("follows standard time in winter", () => {
    // 07:30 UTC is 11:30pm the day before in Seattle (PST, UTC-8).
    expect(seattleDate(new Date("2026-01-15T07:30:00Z"))).toBe("2026-01-14");
  });
});

describe("addDays", () => {
  it("moves a calendar date forward and back", () => {
    expect(addDays("2026-10-12", 14)).toBe("2026-10-26");
    expect(addDays("2026-10-12", -40)).toBe("2026-09-02");
  });

  it("crosses month and year ends", () => {
    expect(addDays("2026-12-25", 10)).toBe("2027-01-04");
    expect(addDays("2026-02-27", 2)).toBe("2026-03-01");
  });

  it("isn't shifted by a DST change", () => {
    // Spans the 2026-03-08 spring-forward in Seattle.
    expect(addDays("2026-02-19", 165)).toBe("2026-08-03");
  });
});

describe("seattleTimeLabel", () => {
  it("shows the day and time in Seattle", () => {
    // 02:00 UTC on the 18th is 7pm on the 17th in Seattle (PDT).
    expect(seattleTimeLabel(new Date("2026-10-18T02:00:00Z"))).toBe(
      "Saturday, October 17 at 7:00 PM",
    );
  });

  it("follows standard time in winter", () => {
    // 03:30 UTC is 7:30pm the day before in Seattle (PST, UTC-8).
    expect(seattleTimeLabel(new Date("2026-12-01T03:30:00Z"))).toBe(
      "Monday, November 30 at 7:30 PM",
    );
  });

  it("shows noon and midnight as 12", () => {
    expect(seattleTimeLabel(new Date("2026-10-12T19:00:00Z"))).toBe(
      "Monday, October 12 at 12:00 PM",
    );
    expect(seattleTimeLabel(new Date("2026-10-13T07:05:00Z"))).toBe(
      "Tuesday, October 13 at 12:05 AM",
    );
  });
});
