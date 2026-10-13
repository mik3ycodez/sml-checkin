import { seattleDate } from "./dates";
import type { Membership, MembershipState } from "./tidyhq";

// TidyHQ treats `activated` and `partial` as active.
const ACTIVE_STATES: ReadonlySet<MembershipState> = new Set([
  "activated",
  "partial",
]);

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
