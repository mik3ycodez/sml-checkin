import { afterEach, describe, expect, it, vi } from "vitest";
import {
  countsAsMembership,
  hasActiveMembership,
  isActiveMembership,
  isRenewalDue,
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

describe("hasActiveMembership", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is false with no memberships", () => {
    expect(hasActiveMembership([], NOW)).toBe(false);
  });

  it.each<MembershipState>(["activated", "partial"])(
    "treats %s as active",
    (state) => {
      expect(hasActiveMembership([membership(state, "2027-01-01")], NOW)).toBe(
        true,
      );
    },
  );

  it.each<MembershipState>(["expired", "pending", "cancelled"])(
    "treats %s as inactive",
    (state) => {
      expect(hasActiveMembership([membership(state, "2027-01-01")], NOW)).toBe(
        false,
      );
    },
  );

  it("treats an activated membership with no end date as active", () => {
    expect(hasActiveMembership([membership("activated", null)], NOW)).toBe(
      true,
    );
  });

  it("is still active on the end date itself", () => {
    expect(
      hasActiveMembership([membership("activated", "2026-10-12")], NOW),
    ).toBe(true);
  });

  it("is inactive after the end date even if TidyHQ hasn't flipped the state", () => {
    expect(
      hasActiveMembership([membership("activated", "2026-10-11")], NOW),
    ).toBe(false);
  });

  it("uses the Seattle date, not the UTC date", () => {
    // 03:00 UTC on the 13th is still the evening of the 12th in Seattle.
    const lateEvening = new Date("2026-10-13T03:00:00Z");
    expect(
      hasActiveMembership([membership("activated", "2026-10-12")], lateEvening),
    ).toBe(true);
  });

  it("is active if any one membership is active", () => {
    expect(
      hasActiveMembership(
        [membership("expired", "2025-10-01"), membership("activated", null)],
        NOW,
      ),
    ).toBe(true);
  });

  it("is inactive before the start date", () => {
    expect(
      hasActiveMembership(
        [membership("activated", "2027-11-01", "2026-11-01")],
        NOW,
      ),
    ).toBe(false);
  });

  it("is active on the start date itself (Seattle date)", () => {
    // 03:00 UTC on the 13th is still the 12th in Seattle.
    const lateEvening = new Date("2026-10-13T03:00:00Z");
    expect(
      hasActiveMembership(
        [membership("activated", "2027-10-12", "2026-10-12")],
        lateEvening,
      ),
    ).toBe(true);
  });

  it("treats a null start date as already started", () => {
    expect(
      hasActiveMembership([membership("activated", null, null)], NOW),
    ).toBe(true);
  });

  it("doesn't depend on locale date formatting", () => {
    // Some runtimes format en-CA as MM/DD/YYYY; an expired membership must
    // still be refused there.
    vi.spyOn(Date.prototype, "toLocaleDateString").mockReturnValue(
      "10/12/2026",
    );
    expect(
      hasActiveMembership([membership("activated", "2026-10-11")], NOW),
    ).toBe(false);
  });
});

describe("isActiveMembership", () => {
  const TODAY = "2026-10-12";

  it("is true for an activated or partial membership within its dates", () => {
    expect(
      isActiveMembership(membership("activated", "2027-01-01"), TODAY),
    ).toBe(true);
    expect(isActiveMembership(membership("partial", "2027-01-01"), TODAY)).toBe(
      true,
    );
  });

  it("is false after the end date or before the start date", () => {
    expect(
      isActiveMembership(membership("activated", "2026-10-11"), TODAY),
    ).toBe(false);
    expect(
      isActiveMembership(
        membership("activated", "2027-11-01", "2026-10-13"),
        TODAY,
      ),
    ).toBe(false);
  });

  it("is false for expired, pending or cancelled states", () => {
    for (const state of ["expired", "pending", "cancelled"] as const) {
      expect(isActiveMembership(membership(state, "2027-01-01"), TODAY)).toBe(
        false,
      );
    }
  });
});

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
