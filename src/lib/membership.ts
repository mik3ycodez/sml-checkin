import { addDays, calendarDate, dateLabel, seattleDate } from "./dates";
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
  // A start date we can't read counts as started, like a missing one.
  const start = calendarDate(m.start_date);
  return start === null || start <= today;
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
 *   state; also an `expired`-state membership ending today. Check-in still works; `renewBy` is the last day that's true.
 * - `lapsed`: past the grace period, or a bad record on its own (`expired`
 *   yet still dated ahead, or an unreadable end date; see
 *   `findInconsistentMemberships`), refused rather than guessed at. A bad
 *   record never outranks a sound membership.
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
function stateRank(state: MembershipState): number {
  return state === "activated" ? 2 : state === "partial" ? 1 : 0;
}

/** True if `a` should win over `b`: ends later, or ties with a better state. */
function ranksAbove(a: Membership, b: Membership): boolean {
  const aEnd = calendarDate(a.end_date);
  const bEnd = calendarDate(b.end_date);
  if (aEnd !== bEnd) {
    if (aEnd === null) return true;
    if (bEnd === null) return false;
    return aEnd > bEnd;
  }
  return stateRank(a.state) > stateRank(b.state);
}

/**
 * A record that shouldn't exist in normal TidyHQ use. Ending a membership
 * early in TidyHQ makes it "cancelled", not "expired", so an expired one
 * still running (or open-ended) is bad data; so is an end date we can't read.
 */
export type MembershipProblem = "expired_not_ended" | "invalid_end_date";

function problemWith(m: Membership, today: string): MembershipProblem | null {
  if (m.end_date !== null && calendarDate(m.end_date) === null) {
    return "invalid_end_date";
  }
  if (m.state === "expired") {
    const end = calendarDate(m.end_date);
    if (end === null || end > today) return "expired_not_ended";
  }
  return null;
}

/**
 * The counted memberships with data problems, for the caller to log (and for
 * admins to see later). Check-in and `/me` carry on regardless: such rows
 * lose to any ordinary membership, and on their own are refused.
 */
export function findInconsistentMemberships(
  memberships: readonly Membership[],
  now: Date,
): { membership: Membership; problem: MembershipProblem }[] {
  const today = seattleDate(now);
  const found = [];
  for (const m of memberships) {
    if (!countsAsMembership(m, today)) continue;
    const problem = problemWith(m, today);
    if (problem) found.push({ membership: m, problem });
  }
  return found;
}

export function membershipStanding(
  memberships: readonly Membership[],
  now: Date,
): MembershipStanding {
  const today = seattleDate(now);
  const counted = memberships.filter((m) => countsAsMembership(m, today));
  // Bad records never outrank a good one, whatever their dates say.
  const sound = counted.filter((m) => problemWith(m, today) === null);
  const pool = sound.length > 0 ? sound : counted;
  let best: Membership | null = null;
  for (const m of pool) {
    if (best === null || ranksAbove(m, best)) best = m;
  }
  if (best === null) return { kind: "none" };

  const endsOn = calendarDate(best.end_date);
  // Only reachable when there's no sound membership: refuse, as before.
  if (problemWith(best, today) !== null) {
    return { kind: "lapsed", membership: best, endsOn };
  }
  // TidyHQ may flip the state to expired before Seattle's end of day. Ending
  // today in that state is treated as the grace period, which the member
  // would be in tomorrow, not refused until then.
  const endsToday = endsOn === today && best.state === "expired";
  if (endsOn === null || (endsOn >= today && !endsToday)) {
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

/**
 * What members read for a notice, as of `now`: a membership ending today says
 * so, since "expired" would be early. Pages add the TidyHQ link.
 */
export function membershipNoticeText(
  notice: MembershipNotice,
  now: Date,
): string {
  switch (notice.kind) {
    case "balance_due":
      return "You have a balance due. Complete payment in TidyHQ.";
    case "grace": {
      const status =
        notice.expiredOn === seattleDate(now)
          ? "ends today"
          : `expired on ${dateLabel(notice.expiredOn)}`;
      return `Your membership ${status}. Renew by ${dateLabel(notice.renewBy)} to keep earning points.`;
    }
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
