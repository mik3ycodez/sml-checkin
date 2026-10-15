import { addDays, dateLabel, seattleDate } from "./dates";
import type { Membership, MembershipState } from "./tidyhq";

// TidyHQ treats `activated` and `partial` as active.
const ACTIVE_STATES: ReadonlySet<MembershipState> = new Set([
  "activated",
  "partial",
]);

/** How many days before the end date the status page nudges a member to renew. */
export const RENEWAL_REMINDER_DAYS = 30;

/**
 * How many days after the end date a member can still check in and earn
 * points, in any counted status (even `expired`). Counted in Seattle
 * calendar days: 60 days past is allowed, 61 is not.
 */
export const GRACE_PERIOD_DAYS = 60;

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

/**
 * Where a member stands, by the counted membership with the latest end date
 * (open-ended counts as latest; on a tie, activated beats partial beats
 * expired). Check-in and the status page both read this, so they can't
 * disagree.
 *
 * - `current`: active state, end date today or later. `balanceDue` if partial.
 * - `grace`: end date passed by `GRACE_PERIOD_DAYS` or fewer, in any counted
 *   state. Check-in still works; `renewBy` is the last day that's true.
 * - `lapsed`: past the grace period, or `expired` yet still dated in the
 *   future (not a case SML's rules name, so refused rather than guessed at).
 * - `none`: no counted membership.
 *
 * Pending and cancelled memberships never count.
 */
export type MembershipStanding =
  | { kind: "none" }
  | {
      kind: "current";
      membership: Membership;
      /** `YYYY-MM-DD`; null if open-ended. */
      endsOn: string | null;
      balanceDue: boolean;
    }
  | {
      kind: "grace";
      membership: Membership;
      endsOn: string;
      renewBy: string;
    }
  | { kind: "lapsed"; membership: Membership; endsOn: string | null };

// Tie-break for memberships ending the same day: paid, then partial.
const STATE_RANK: Record<MembershipState, number> = {
  activated: 3,
  partial: 2,
  expired: 1,
  pending: 0,
  cancelled: 0,
};

/** True if `a` should win over `b`: ends later, or ties with a better state. */
function ranksAbove(a: Membership, b: Membership): boolean {
  if (a.end_date !== b.end_date) {
    if (a.end_date === null) return true;
    if (b.end_date === null) return false;
    return a.end_date > b.end_date;
  }
  return STATE_RANK[a.state] > STATE_RANK[b.state];
}

export function membershipStanding(
  memberships: readonly Membership[],
  now: Date,
): MembershipStanding {
  const today = seattleDate(now);
  let best: Membership | null = null;
  for (const m of memberships) {
    if (!countsAsMembership(m, today)) continue;
    if (best === null || ranksAbove(m, best)) best = m;
  }
  if (best === null) return { kind: "none" };

  const endsOn = best.end_date;
  if (endsOn === null || endsOn >= today) {
    return ACTIVE_STATES.has(best.state)
      ? {
          kind: "current",
          membership: best,
          endsOn,
          balanceDue: best.state === "partial",
        }
      : { kind: "lapsed", membership: best, endsOn };
  }
  const renewBy = addDays(endsOn, GRACE_PERIOD_DAYS);
  return renewBy >= today
    ? { kind: "grace", membership: best, endsOn, renewBy }
    : { kind: "lapsed", membership: best, endsOn };
}

/** A message a member should see alongside check-in or their status. */
export type MembershipNotice =
  | { kind: "balance_due" }
  | { kind: "grace"; expiredOn: string; renewBy: string };

/**
 * The notice for a standing, or null. A balance due is only for a current
 * membership; a partial one already past its end date gets the grace message.
 */
export function membershipNotice(
  standing: MembershipStanding,
): MembershipNotice | null {
  if (standing.kind === "current" && standing.balanceDue) {
    return { kind: "balance_due" };
  }
  if (standing.kind === "grace") {
    return {
      kind: "grace",
      expiredOn: standing.endsOn,
      renewBy: standing.renewBy,
    };
  }
  return null;
}

/** What members read for a notice. Pages add the TidyHQ link. */
export function membershipNoticeText(notice: MembershipNotice): string {
  switch (notice.kind) {
    case "balance_due":
      return "You have a balance due. Complete payment in TidyHQ.";
    case "grace":
      return `Your membership expired on ${dateLabel(notice.expiredOn)}. Renew by ${dateLabel(notice.renewBy)} to keep earning points.`;
  }
}

/**
 * True if `endDate` (`YYYY-MM-DD`, null = open-ended) is within
 * `RENEWAL_REMINDER_DAYS` of today, inclusive. Says nothing about whether the
 * membership is still active; pair it with `membershipStanding`.
 */
export function isRenewalDue(endDate: string | null, now: Date): boolean {
  if (endDate === null) return false;
  return endDate <= addDays(seattleDate(now), RENEWAL_REMINDER_DAYS);
}
