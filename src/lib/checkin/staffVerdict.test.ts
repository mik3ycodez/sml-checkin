import { describe, expect, it } from "vitest";
import type { CheckInAssessment } from "./checkIn";
import { membershipWarnings, staffVerdict } from "./staffVerdict";

type Shown = Exclude<
  CheckInAssessment,
  { status: "unknown_event" | "unknown_contact" }
>;

const base = { name: "Dante Ruiz", eventName: "Social Night" };
const NOW = new Date("2026-10-12T18:00:00Z");
const OPENS = new Date("2026-10-17T01:30:00Z");

// One of every status the verdict has to word. A Record, so a new status
// can't be left out of this list either.
const CASES: Record<Shown["status"], Shown> = {
  ready: {
    status: "ready",
    ...base,
    groupId: "g",
    stored: 3,
    membershipNotice: { kind: "balance_due" },
    rewards: [],
    rewardStanding: "current",
    colorsIssued: false,
  },
  already_checked_in: { status: "already_checked_in", ...base, total: 3 },
  not_open: { status: "not_open", ...base, total: 3, opensAt: OPENS },
  closed: { status: "closed", ...base, total: 3 },
  event_unavailable: { status: "event_unavailable", ...base, total: 3 },
  membership_inactive: { status: "membership_inactive", ...base, total: 3 },
  points_unreadable: { status: "points_unreadable", ...base, total: null },
};

const GENERIC = "Can't check in here. Please see a Board member.";
const MEMBERSHIP_WORDING =
  /membership|renew|balance|expired|lapsed|payment|pay |grace|unreadable|can't be read|inconsistent|club colors/i;

describe("staffVerdict", () => {
  it("has wording for every status, for both roles", () => {
    for (const assessment of Object.values(CASES)) {
      for (const role of ["admin", "volunteer"] as const) {
        const verdict = staffVerdict(assessment, role, NOW);
        expect(verdict.text, `${assessment.status} ${role}`).not.toBe("");
        expect(verdict.name).toBe("Dante Ruiz");
      }
    }
  });

  it("lets only a member who is ready be checked in", () => {
    for (const assessment of Object.values(CASES)) {
      expect(staffVerdict(assessment, "volunteer", NOW).canCheckIn).toBe(
        assessment.status === "ready",
      );
    }
  });

  describe("for a volunteer", () => {
    it("gives a specific reason for event-related outcomes", () => {
      const text = (s: Shown["status"]) =>
        staffVerdict(CASES[s], "volunteer", NOW).text;
      expect(text("ready")).toBe("Can check in.");
      expect(text("already_checked_in")).toBe("Already checked in.");
      expect(text("not_open")).toBe(
        "Check-in isn't open yet. It opens Friday, October 16 at 6:30 PM.",
      );
      expect(text("closed")).toBe("Check-in for this event has closed.");
      expect(text("event_unavailable")).toBe(
        "This event isn't open for check-in.",
      );
    });

    it("gives one generic line for every membership or points refusal", () => {
      for (const status of [
        "membership_inactive",
        "points_unreadable",
      ] as const) {
        expect(staffVerdict(CASES[status], "volunteer", NOW).text).toBe(
          GENERIC,
        );
      }
    });

    it("never contains membership-status or balance wording", () => {
      for (const assessment of Object.values(CASES)) {
        const verdict = staffVerdict(assessment, "volunteer", NOW);
        expect(JSON.stringify(verdict), assessment.status).not.toMatch(
          MEMBERSHIP_WORDING,
        );
      }
    });

    it("hides a balance due on a member who can check in", () => {
      expect(staffVerdict(CASES.ready, "volunteer", NOW).text).toBe(
        "Can check in.",
      );
    });

    it("shows the points total when it is readable, and nothing when it isn't", () => {
      expect(
        staffVerdict(CASES.membership_inactive, "volunteer", NOW).total,
      ).toBe(3);
      expect(
        staffVerdict(CASES.points_unreadable, "volunteer", NOW).total,
      ).toBeNull();
    });
  });

  describe("for an admin", () => {
    it("gives the specific membership and points reasons", () => {
      const text = (s: Shown["status"]) =>
        staffVerdict(CASES[s], "admin", NOW).text;
      expect(text("membership_inactive")).toMatch(/membership/i);
      expect(text("points_unreadable")).toMatch(/points total/i);
      expect(text("membership_inactive")).not.toBe(GENERIC);
    });

    it("says a grace-period membership ends today, like the member's own notice", () => {
      const grace = {
        ...CASES.ready,
        membershipNotice: {
          kind: "grace",
          expiredOn: "2026-10-12",
          renewBy: "2026-12-11",
        },
      } as Shown;
      expect(staffVerdict(grace, "admin", NOW).text).toContain("ends today");
    });

    it("adds the balance-due notice to a member who can check in", () => {
      expect(staffVerdict(CASES.ready, "admin", NOW).text).toMatch(
        /^Can check in\./,
      );
      expect(staffVerdict(CASES.ready, "admin", NOW).text).toMatch(
        /balance due/i,
      );
    });
  });
});

describe("membershipWarnings", () => {
  const expiredButFuture = {
    id: "m_bad",
    state: "expired",
    status: "Expired",
    membership_level_id: "lvl_full",
    contact_id: "c_x",
    start_date: "2026-01-01",
    end_date: "2027-01-01",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  } as const;

  it("names the membership id and the problem, nothing personal", () => {
    expect(membershipWarnings([expiredButFuture], NOW)).toEqual([
      "Membership m_bad is marked expired but its end date is in the future (or missing). Fix it in TidyHQ.",
    ]);
  });

  it("is empty for ordinary records", () => {
    expect(
      membershipWarnings(
        [{ ...expiredButFuture, state: "activated", status: "Activated" }],
        NOW,
      ),
    ).toEqual([]);
  });
});
