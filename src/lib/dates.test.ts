import { describe, expect, it } from "vitest";
import { seattleDate } from "./dates";

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
