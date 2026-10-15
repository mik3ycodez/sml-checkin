import { describe, expect, it } from "vitest";
import {
  addDays,
  calendarDate,
  dateLabel,
  isCalendarDate,
  seattleDate,
  seattleStartOfDay,
  seattleTimeLabel,
} from "./dates";

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

describe("dateLabel", () => {
  it("writes a calendar date out for members", () => {
    expect(dateLabel("2026-09-22")).toBe("September 22, 2026");
    expect(dateLabel("2027-01-05")).toBe("January 5, 2027");
    expect(dateLabel("2026-12-31")).toBe("December 31, 2026");
  });
});

describe("isCalendarDate", () => {
  it("accepts a real YYYY-MM-DD date", () => {
    expect(isCalendarDate("2026-09-22")).toBe(true);
    expect(isCalendarDate("2028-02-29")).toBe(true);
  });

  it.each([
    "",
    "2026-9-22",
    "2026-13-45",
    "2027-02-29",
    "2026-09-22T00:00:00Z",
    "tomorrow",
  ])("rejects %j", (value) => {
    expect(isCalendarDate(value)).toBe(false);
  });
});

describe("calendarDate", () => {
  it("keeps a plain date and trims a timestamp to its date", () => {
    expect(calendarDate("2026-09-22")).toBe("2026-09-22");
    expect(calendarDate("2026-09-22T00:00:00Z")).toBe("2026-09-22");
    expect(calendarDate("2026-09-22T23:30:00-07:00")).toBe("2026-09-22");
  });

  it("is null for nothing or for something that isn't a date", () => {
    expect(calendarDate(null)).toBeNull();
    expect(calendarDate("soon")).toBeNull();
    expect(calendarDate("2026-13-45")).toBeNull();
  });
});

describe("date helpers given something that isn't YYYY-MM-DD", () => {
  it("addDays and dateLabel throw a clear error instead of returning garbage", () => {
    expect(() => addDays("2026-09-22T00:00:00Z", 1)).toThrow(/YYYY-MM-DD/);
    expect(() => dateLabel("soon")).toThrow(/YYYY-MM-DD/);
  });
});

describe("seattleStartOfDay", () => {
  it("is midnight Seattle time as a moment, in summer (UTC-7)", () => {
    expect(seattleStartOfDay("2026-10-12").toISOString()).toBe(
      "2026-10-12T07:00:00.000Z",
    );
  });

  it("is midnight Seattle time in winter (UTC-8)", () => {
    expect(seattleStartOfDay("2026-12-20").toISOString()).toBe(
      "2026-12-20T08:00:00.000Z",
    );
  });

  it("is right on the days the clocks change", () => {
    expect(seattleStartOfDay("2026-03-08").toISOString()).toBe(
      "2026-03-08T08:00:00.000Z",
    );
    expect(seattleStartOfDay("2026-11-01").toISOString()).toBe(
      "2026-11-01T07:00:00.000Z",
    );
  });

  it("throws for something that isn't YYYY-MM-DD", () => {
    expect(() => seattleStartOfDay("soon")).toThrow(/YYYY-MM-DD/);
  });
});
