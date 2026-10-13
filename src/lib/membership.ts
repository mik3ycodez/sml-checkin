import type { Membership, MembershipState } from "./tidyhq";

/** SML's time zone; membership end dates are Seattle calendar dates. */
export const SML_TIME_ZONE = "America/Los_Angeles";

// TidyHQ treats `activated` and `partial` as active.
const ACTIVE_STATES: ReadonlySet<MembershipState> = new Set([
  "activated",
  "partial",
]);

/** `YYYY-MM-DD` for `now` in Seattle. */
function seattleDate(now: Date): string {
  // en-CA formats dates as YYYY-MM-DD.
  return now.toLocaleDateString("en-CA", { timeZone: SML_TIME_ZONE });
}

/**
 * True if any membership is in an active state and hasn't passed its end
 * date. The end date is checked too, in case TidyHQ hasn't yet flipped the
 * state to `expired`. A membership is still valid on its end date.
 */
export function hasActiveMembership(
  memberships: readonly Membership[],
  now: Date,
): boolean {
  const today = seattleDate(now);
  return memberships.some(
    (m) =>
      ACTIVE_STATES.has(m.state) && (m.end_date === null || m.end_date >= today),
  );
}
