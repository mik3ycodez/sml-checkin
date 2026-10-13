import type { Membership, MembershipState } from "./tidyhq";

/** SML's time zone; membership end dates are Seattle calendar dates. */
export const SML_TIME_ZONE = "America/Los_Angeles";

// TidyHQ treats `activated` and `partial` as active.
const ACTIVE_STATES: ReadonlySet<MembershipState> = new Set([
  "activated",
  "partial",
]);

const seattleDateParts = new Intl.DateTimeFormat("en-US", {
  timeZone: SML_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** `YYYY-MM-DD` for `now` in Seattle, built from parts so locale data can't change the format. */
function seattleDate(now: Date): string {
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    seattleDateParts.formatToParts(now).find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

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
