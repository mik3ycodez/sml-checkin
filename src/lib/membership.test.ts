import { afterEach, describe, expect, it, vi } from "vitest";
import {
  countsAsMembership,
  GRACE_PERIOD_DAYS,
  findInconsistentMemberships,
  isRenewalDue,
  membershipNotice,
  membershipStanding,
  RENEWAL_REMINDER_DAYS,
} from "./membership";
import type { Membership, MembershipState } from "./tidyhq";

// 18:00 UTC is 11am in Seattle, so the Seattle date is 2026-10-12.
const NOW = new Date("2026-10-12T18:00:00Z");

function membership(
  state: MembershipState,
  endDate: string | null,
  startDate: string | null = "2026-01-01",
): Membership {
  return {
    id: "m_test",
    state,
    status: state,
    membership_level_id: "lvl_full",
    contact_id: "c_test",
    start_date: startDate,
    end_date: endDate,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

describe("countsAsMembership", () => {
  const TODAY = "2026-10-12";

  it("counts active and expired memberships", () => {
    expect(
      countsAsMembership(membership("activated", "2027-01-01"), TODAY),
    ).toBe(true);
    expect(countsAsMembership(membership("expired", "2026-09-01"), TODAY)).toBe(
      true,
    );
  });

  it("doesn't count pending or cancelled memberships", () => {
    expect(countsAsMembership(membership("pending", "2027-01-01"), TODAY)).toBe(
      false,
    );
    expect(
      countsAsMembership(membership("cancelled", "2027-01-01"), TODAY),
    ).toBe(false);
  });

  it("doesn't count a membership that hasn't started", () => {
    expect(
      countsAsMembership(
        membership("activated", "2027-11-01", "2026-11-01"),
        TODAY,
      ),
    ).toBe(false);
  });

  it("counts one starting today or with no start date", () => {
    expect(
      countsAsMembership(membership("activated", "2027-10-12", TODAY), TODAY),
    ).toBe(true);
    expect(countsAsMembership(membership("activated", null, null), TODAY)).toBe(
      true,
    );
  });
});

describe("isRenewalDue", () => {
  it("is false for an open-ended membership", () => {
    expect(isRenewalDue(null, NOW)).toBe(false);
  });

  it("is true up to RENEWAL_REMINDER_DAYS out, false a day later", () => {
    // NOW is 2026-10-12 in Seattle; 30 days later is 2026-11-11.
    expect(RENEWAL_REMINDER_DAYS).toBe(30);
    expect(isRenewalDue("2026-11-11", NOW)).toBe(true);
    expect(isRenewalDue("2026-11-12", NOW)).toBe(false);
  });

  it("is true on the end date itself", () => {
    expect(isRenewalDue("2026-10-12", NOW)).toBe(true);
  });
});

// NOW is 2026-10-12 in Seattle. 60 days before is 2026-08-13.
describe("membershipStanding", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const standing = (...ms: Membership[]) => membershipStanding(ms, NOW);

  it("keeps the grace period in one config spot, next to the reminder", () => {
    expect(GRACE_PERIOD_DAYS).toBe(60);
  });

  it("is none with no memberships", () => {
    expect(standing()).toEqual({ kind: "none" });
  });

  it("never counts a pending or cancelled membership, even a recent one", () => {
    expect(
      standing(
        membership("pending", "2026-10-01"),
        membership("cancelled", "2026-10-01"),
      ),
    ).toEqual({ kind: "none" });
  });

  it("is current for an activated membership ending in the future", () => {
    expect(standing(membership("activated", "2027-01-01"))).toMatchObject({
      kind: "current",
      endsOn: "2027-01-01",
      balanceDue: false,
    });
  });

  it("is current, with a balance due, for a partial membership ending in the future", () => {
    expect(standing(membership("partial", "2027-01-01"))).toMatchObject({
      kind: "current",
      balanceDue: true,
    });
  });

  it("is current on the end date itself", () => {
    expect(standing(membership("activated", "2026-10-12"))).toMatchObject({
      kind: "current",
    });
  });

  it("treats an open-ended membership as current", () => {
    expect(standing(membership("activated", null))).toMatchObject({
      kind: "current",
      endsOn: null,
    });
  });

  it("uses the Seattle date, not the UTC date", () => {
    // 03:00 UTC on the 13th is still the evening of the 12th in Seattle.
    const lateEvening = new Date("2026-10-13T03:00:00Z");
    expect(
      membershipStanding([membership("activated", "2026-10-12")], lateEvening),
    ).toMatchObject({ kind: "current" });
  });

  it("is in grace the day after the end date, renew by end date + 60 days", () => {
    expect(standing(membership("expired", "2026-10-11"))).toMatchObject({
      kind: "grace",
      endsOn: "2026-10-11",
      renewBy: "2026-12-10",
    });
  });

  it("is still in grace exactly 60 days past the end date", () => {
    expect(standing(membership("expired", "2026-08-13"))).toMatchObject({
      kind: "grace",
      renewBy: "2026-10-12",
    });
  });

  it("is lapsed 61 days past the end date", () => {
    expect(standing(membership("expired", "2026-08-12"))).toMatchObject({
      kind: "lapsed",
      endsOn: "2026-08-12",
    });
  });

  it.each<MembershipState>(["activated", "partial", "expired"])(
    "puts a %s membership 60 days past in grace and 61 days past out of it",
    (state) => {
      expect(standing(membership(state, "2026-08-13")).kind).toBe("grace");
      expect(standing(membership(state, "2026-08-12")).kind).toBe("lapsed");
    },
  );

  it("moves the 60-day line with the Seattle date, not the UTC date", () => {
    // 03:00 UTC on 2026-10-13 is still 2026-10-12 in Seattle, so 2026-08-13
    // is exactly 60 days past, not 61.
    const lateEvening = new Date("2026-10-13T03:00:00Z");
    expect(
      membershipStanding([membership("expired", "2026-08-13")], lateEvening)
        .kind,
    ).toBe("grace");
  });

  it("counts days across a daylight-saving change as calendar days", () => {
    // 2026-11-01 is the fall-back day; 60 calendar days past 2026-09-02 is
    // 2026-11-01. The 24-hour blocks in between are 61, which must not matter.
    const dstDay = new Date("2026-11-01T20:00:00Z");
    expect(
      membershipStanding([membership("expired", "2026-09-02")], dstDay).kind,
    ).toBe("grace");
    expect(
      membershipStanding([membership("expired", "2026-09-01")], dstDay).kind,
    ).toBe("lapsed");
  });

  it("uses the counted membership with the latest end date", () => {
    expect(
      standing(
        membership("expired", "2025-01-01"),
        membership("activated", "2027-01-01"),
      ),
    ).toMatchObject({ kind: "current", endsOn: "2027-01-01" });
  });

  it("measures grace from the latest end date, not an older one", () => {
    expect(
      standing(
        membership("expired", "2026-01-01"),
        membership("expired", "2026-10-01"),
      ),
    ).toMatchObject({ kind: "grace", endsOn: "2026-10-01" });
  });

  it("ignores a pending or cancelled membership with a later end date", () => {
    expect(
      standing(
        membership("activated", "2026-12-01"),
        membership("pending", "2027-12-01"),
        membership("cancelled", "2028-12-01"),
      ),
    ).toMatchObject({ kind: "current", endsOn: "2026-12-01" });
  });

  it("ignores a membership that hasn't started", () => {
    expect(
      standing(
        membership("expired", "2026-08-01"),
        membership("activated", "2027-11-01", "2026-11-01"),
      ),
    ).toMatchObject({ kind: "lapsed", endsOn: "2026-08-01" });
  });

  it("prefers activated over partial when end dates tie", () => {
    expect(
      standing(
        membership("partial", "2027-01-01"),
        membership("activated", "2027-01-01"),
      ),
    ).toMatchObject({ kind: "current", balanceDue: false });
  });

  it("is lapsed for an expired-state membership TidyHQ still dates in the future", () => {
    // Not a case the rules name; refused as before, rather than guessed at.
    expect(standing(membership("expired", "2027-01-01")).kind).toBe("lapsed");
  });

  it("treats a membership starting today, or with no start date, as started", () => {
    expect(
      standing(membership("activated", "2027-10-12", "2026-10-12")).kind,
    ).toBe("current");
    expect(standing(membership("activated", null, null)).kind).toBe("current");
  });

  it("doesn't depend on locale date formatting", () => {
    // Some runtimes format en-CA as MM/DD/YYYY; a lapsed membership must
    // still be refused there.
    vi.spyOn(Date.prototype, "toLocaleDateString").mockReturnValue(
      "10/12/2026",
    );
    expect(standing(membership("expired", "2026-01-01")).kind).toBe("lapsed");
  });

  it("isn't thrown off by an expired-state row dated later than a valid membership", () => {
    // TidyHQ ends memberships early as "cancelled", so this is bad data. It
    // must not shut out a member who has a good, active membership.
    const active = membership("activated", "2027-03-01");
    expect(standing(active, membership("expired", "2027-06-01"))).toMatchObject(
      { kind: "current", membership: active },
    );
    expect(standing(active, membership("expired", null))).toMatchObject({
      kind: "current",
      membership: active,
    });
  });

  it("still refuses a member whose only membership is an expired-state row dated in the future", () => {
    expect(standing(membership("expired", "2027-06-01")).kind).toBe("lapsed");
    expect(standing(membership("expired", null)).kind).toBe("lapsed");
  });

  it("falls back to grace from a good row when the bad row is the later one", () => {
    expect(
      standing(
        membership("expired", "2026-09-22"),
        membership("expired", "2027-06-01"),
      ),
    ).toMatchObject({ kind: "grace", endsOn: "2026-09-22" });
  });

  it("reads a timestamp end date as its date", () => {
    expect(
      standing(membership("expired", "2026-09-22T00:00:00Z")),
    ).toMatchObject({
      kind: "grace",
      endsOn: "2026-09-22",
      renewBy: "2026-11-21",
    });
    expect(
      standing(membership("activated", "2027-01-01T00:00:00Z")),
    ).toMatchObject({ kind: "current", endsOn: "2027-01-01" });
  });

  it("reads a timestamp start date as its date too", () => {
    expect(
      standing(membership("activated", "2027-01-01", "2026-10-12T00:00:00Z"))
        .kind,
    ).toBe("current");
    expect(
      standing(membership("activated", "2027-01-01", "2026-10-13T00:00:00Z"))
        .kind,
    ).toBe("none");
  });

  it("refuses, rather than throws, on an end date it can't read", () => {
    expect(standing(membership("activated", "soon")).kind).toBe("lapsed");
    const good = membership("activated", "2027-01-01");
    expect(standing(good, membership("activated", "soon"))).toMatchObject({
      kind: "current",
      membership: good,
    });
  });

  it("reports the membership it chose", () => {
    const m = membership("activated", "2027-01-01");
    expect(standing(m)).toMatchObject({ membership: m });
  });
});

describe("membershipNotice", () => {
  const notice = (...ms: Membership[]) =>
    membershipNotice(membershipStanding(ms, NOW));

  it("is null for a paid, current membership", () => {
    expect(notice(membership("activated", "2027-01-01"))).toBeNull();
  });

  it("says a balance is due for partial with a future end date", () => {
    expect(notice(membership("partial", "2027-01-01"))).toEqual({
      kind: "balance_due",
    });
  });

  it("gives the grace dates for a membership in its grace period", () => {
    expect(notice(membership("expired", "2026-09-22"))).toEqual({
      kind: "grace",
      expiredOn: "2026-09-22",
      renewBy: "2026-11-21",
    });
  });

  it("says grace, not balance due, for a partial membership already past its end date", () => {
    expect(notice(membership("partial", "2026-09-22"))).toMatchObject({
      kind: "grace",
    });
  });

  it("is null when there's no membership or it's lapsed", () => {
    expect(notice()).toBeNull();
    expect(notice(membership("expired", "2026-01-01"))).toBeNull();
  });
});

describe("findInconsistentMemberships", () => {
  const find = (...ms: Membership[]) => findInconsistentMemberships(ms, NOW);

  it("flags an expired-state membership with a future or missing end date", () => {
    const future = membership("expired", "2027-06-01");
    const open = membership("expired", null);
    expect(find(future, open)).toEqual([
      { membership: future, problem: "expired_not_ended" },
      { membership: open, problem: "expired_not_ended" },
    ]);
  });

  it("flags an end date it can't read", () => {
    const bad = membership("activated", "soon");
    expect(find(bad)).toEqual([
      { membership: bad, problem: "invalid_end_date" },
    ]);
  });

  it("doesn't flag ordinary records", () => {
    expect(
      find(
        membership("activated", "2027-01-01"),
        membership("partial", "2027-01-01"),
        membership("expired", "2026-09-22"),
        membership("expired", "2026-10-12T00:00:00Z"),
        membership("cancelled", "2027-01-01"),
        membership("pending", null),
      ),
    ).toEqual([]);
  });
});
