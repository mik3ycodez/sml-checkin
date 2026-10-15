import { addDays, seattleDate } from "./dates";
import type { Membership, MembershipState } from "./tidyhq";

// TidyHQ treats `activated` and `partial` as active.
const ACTIVE_STATES: ReadonlySet<MembershipState> = new Set([
  "activated",
  "partial",
]);

/** How many days before the end date the status page nudges a member to renew. */
export const RENEWAL_REMINDER_DAYS = 30;

/**
 * True if any membership is in an active state and today falls within its
 * start and end dates (inclusive; null means open-ended). Dates are checked
 * too, in case TidyHQ hasn't yet flipped the state, and so a membership
 * bought ahead doesn't count before it starts.
 */
export function hasActiveMembership(
  memberships: readonly Membership[],
  now: Date,
): boolean {
  const today = seattleDate(now);
  return memberships.some(
    (m) =>
      ACTIVE_STATES.has(m.state) &&
      (m.start_date === null || m.start_date <= today) &&
      (m.end_date === null || m.end_date >= today),
  );
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
