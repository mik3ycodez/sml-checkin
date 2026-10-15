import { addDays, seattleDate } from "./dates";
import type { Membership, MembershipState } from "./tidyhq";

// TidyHQ treats `activated` and `partial` as active.
const ACTIVE_STATES: ReadonlySet<MembershipState> = new Set([
  "activated",
  "partial",
]);

/** How many days before the end date the status page nudges a member to renew. */
export const RENEWAL_REMINDER_DAYS = 30;

// Never a real membership: pending isn't paid yet, cancelled was withdrawn.
const UNCOUNTED_STATES: ReadonlySet<MembershipState> = new Set([
  "pending",
  "cancelled",
]);

function hasStarted(m: Membership, today: string): boolean {
  return m.start_date === null || m.start_date <= today;
}

/**
 * True if the membership is in an active state and `today` (Seattle
 * `YYYY-MM-DD`) falls within its start and end dates (inclusive; null means
 * open-ended). Dates are checked too, in case TidyHQ hasn't yet flipped the
 * state, and so a membership doesn't count before it starts.
 */
export function isActiveMembership(m: Membership, today: string): boolean {
  return (
    ACTIVE_STATES.has(m.state) &&
    hasStarted(m, today) &&
    (m.end_date === null || m.end_date >= today)
  );
}

/**
 * True if the membership is a real one, current or past: not pending or
 * cancelled, and already started. SML memberships start on the payment date,
 * so a future start shouldn't happen; it's excluded defensively.
 */
export function countsAsMembership(m: Membership, today: string): boolean {
  return !UNCOUNTED_STATES.has(m.state) && hasStarted(m, today);
}

/** True if any membership is active today (Seattle date). */
export function hasActiveMembership(
  memberships: readonly Membership[],
  now: Date,
): boolean {
  const today = seattleDate(now);
  return memberships.some((m) => isActiveMembership(m, today));
}

/**
 * True if `endDate` (`YYYY-MM-DD`, null = open-ended) is within
 * `RENEWAL_REMINDER_DAYS` of today, inclusive. Says nothing about whether the
 * membership is still active; pair it with `hasActiveMembership`.
 */
export function isRenewalDue(endDate: string | null, now: Date): boolean {
  if (endDate === null) return false;
  return endDate <= addDays(seattleDate(now), RENEWAL_REMINDER_DAYS);
}
