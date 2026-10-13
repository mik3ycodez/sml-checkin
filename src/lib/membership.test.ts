import { describe, expect, it } from "vitest";
import { hasActiveMembership } from "./membership";
import type { Membership, MembershipState } from "./tidyhq";

// 18:00 UTC is 11am in Seattle, so the Seattle date is 2026-10-12.
const NOW = new Date("2026-10-12T18:00:00Z");

function membership(
  state: MembershipState,
  endDate: string | null,
): Membership {
  return {
    id: "m_test",
    state,
    status: state,
    membership_level_id: "lvl_full",
    contact_id: "c_test",
    start_date: "2026-01-01",
    end_date: endDate,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

describe("hasActiveMembership", () => {
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
});
