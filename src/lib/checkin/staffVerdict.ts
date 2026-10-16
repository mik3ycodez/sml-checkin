import { seattleTimeLabel } from "../dates";
import {
  findInconsistentMemberships,
  membershipNoticeStaffText,
  type MembershipProblem,
} from "../membership";
import type { Membership } from "../tidyhq/types";
import type { CheckInAssessment } from "./checkIn";

/** The assessments a staff screen words; an unknown event or contact has its own screen. */
export type StaffAssessment = Exclude<
  CheckInAssessment,
  { status: "unknown_event" | "unknown_contact" }
>;

export type StaffRole = "admin" | "volunteer";

export interface StaffVerdict {
  name: string;
  /** The stored points total, or null if it can't be read. */
  total: number | null;
  /** True only when the confirm button should show. */
  canCheckIn: boolean;
  text: string;
}

/**
 * What a volunteer is told about any membership or points refusal. Volunteers
 * never see why: standing, balances and points problems are the Board's to
 * handle, so this one line stands for all of them.
 */
export const VOLUNTEER_GENERIC_REFUSAL =
  "Can't check in here. Please see a Board member.";

/**
 * What a staff screen says about a member, for one role. Event-related
 * outcomes (already checked in, not open yet, closed, unavailable) get the
 * same specific wording for both roles. Membership and points refusals are
 * specific only for admins: a volunteer gets `VOLUNTEER_GENERIC_REFUSAL`, and
 * never sees a membership notice on a member who can check in. A Record
 * over every status, so a new one can't go unworded.
 */
export function staffVerdict(
  assessment: StaffAssessment,
  role: StaffRole,
  now: Date,
): StaffVerdict {
  const total =
    assessment.status === "ready" ? assessment.stored : assessment.total;
  const verdict = (canCheckIn: boolean, text: string): StaffVerdict => ({
    name: assessment.name,
    total,
    canCheckIn,
    text,
  });
  const refusal = (adminText: string) =>
    verdict(false, role === "admin" ? adminText : VOLUNTEER_GENERIC_REFUSAL);

  switch (assessment.status) {
    case "ready": {
      const notice =
        role === "admin" && assessment.membershipNotice
          ? ` ${membershipNoticeStaffText(assessment.membershipNotice, now)}`
          : "";
      return verdict(true, `Can check in.${notice}`);
    }
    case "already_checked_in":
      return verdict(false, "Already checked in.");
    case "not_open":
      return verdict(
        false,
        `Check-in isn't open yet. It opens ${seattleTimeLabel(assessment.opensAt)}.`,
      );
    case "closed":
      return verdict(false, "Check-in for this event has closed.");
    case "event_unavailable":
      return verdict(false, "This event isn't open for check-in.");
    case "membership_inactive":
      return refusal(
        "No current membership (none, or past the grace period). Ask them to renew in TidyHQ.",
      );
    case "points_unreadable":
      return refusal(
        "Their points total in TidyHQ can't be read. Fix it in TidyHQ before checking them in.",
      );
  }
}

const PROBLEM_TEXT: Record<MembershipProblem, string> = {
  expired_not_ended:
    "is marked expired but its end date is in the future (or missing)",
  invalid_end_date: "has an end date the app can't read",
};

/**
 * Admin-only warnings about membership records that look wrong, so an admin
 * can see why a member was refused. Ids and the problem only.
 */
export function membershipWarnings(
  memberships: readonly Membership[],
  now: Date,
): string[] {
  return findInconsistentMemberships(memberships, now).map(
    ({ membership, problem }) =>
      `Membership ${membership.id} ${PROBLEM_TEXT[problem]}. Fix it in TidyHQ.`,
  );
}
