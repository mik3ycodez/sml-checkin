// A short-lived note from the check-in action to the result page about what
// this tap did. The result page re-reads everything else from TidyHQ, but
// group membership alone can't tell it whether this tap awarded a point, was
// a repeat, or added the member but failed to save their point (the points
// write may fail, or staff may have added them), so without this note it
// would have to guess.
//
// Not signed: it only changes what the member's own screen says. It's never
// used to award or write points, and the total shown is always TidyHQ's.

import { addDays, isCalendarDate } from "../dates";
import { GRACE_PERIOD_DAYS, type MembershipNotice } from "../membership";
import {
  findReward,
  REWARD_STANDINGS,
  type QualifiedReward,
  type RewardStanding,
} from "../rewards";

export const TAP_NOTICE_COOKIE = "sml_tap";
/** Long enough for the redirect, short enough not to linger. */
export const TAP_NOTICE_MAX_AGE_SECONDS = 60;

/** What the last tap did, for a member who is now in the event's group. */
export type TapOutcome =
  | {
      kind: "awarded";
      points: number;
      /** Balance due or grace period, shown with the confirmation. Left out, never null, when there's none. */
      membershipNotice?: MembershipNotice;
      /** Rewards this point reached. Left out, never empty, when there are none. */
      qualified?: readonly QualifiedReward[];
    }
  /** Already checked in, so no point. */
  | { kind: "repeat" }
  /** Added to the group, but the points write failed. */
  | { kind: "point_not_saved"; membershipNotice?: MembershipNotice };

type For = { eventId: string; contactId: string };

export function encodeTapNotice({
  eventId,
  contactId,
  outcome,
}: For & { outcome: TapOutcome }): string {
  const params = new URLSearchParams({
    e: eventId,
    c: contactId,
    o: outcome.kind,
  });
  if (outcome.kind === "awarded") {
    params.set("p", String(outcome.points));
    if (outcome.qualified?.length) {
      params.set(
        "q",
        outcome.qualified.map((q) => `${q.rewardId}:${q.standing}`).join(","),
      );
    }
  }
  if (outcome.kind === "awarded" || outcome.kind === "point_not_saved") {
    const notice = outcome.membershipNotice;
    if (notice) {
      params.set("m", notice.kind);
      // The renew-by date is worked out again on read, so it can't disagree.
      if (notice.kind === "grace") params.set("x", notice.expiredOn);
    }
  }
  return params.toString();
}

/**
 * What the last tap did for this member at this event, or null if the notice
 * is missing, malformed, or for someone else (a shared phone).
 */
export function readTapNotice(
  value: string | undefined,
  { eventId, contactId }: For,
): TapOutcome | null {
  if (!value) return null;
  const params = new URLSearchParams(value);
  if (params.get("e") !== eventId || params.get("c") !== contactId) return null;
  switch (params.get("o")) {
    case "awarded": {
      const points = params.get("p") ?? "";
      if (!/^[1-9]\d*$/.test(points)) return null;
      const membershipNotice = readMembershipNotice(params);
      const qualified = readQualified(params);
      return {
        kind: "awarded",
        points: Number(points),
        ...(membershipNotice && { membershipNotice }),
        ...(qualified.length > 0 && { qualified }),
      };
    }
    case "repeat":
      return { kind: "repeat" };
    case "point_not_saved": {
      const membershipNotice = readMembershipNotice(params);
      return {
        kind: "point_not_saved",
        ...(membershipNotice && { membershipNotice }),
      };
    }
    default:
      return null;
  }
}

function readMembershipNotice(
  params: URLSearchParams,
): MembershipNotice | null {
  switch (params.get("m")) {
    case "balance_due":
      return { kind: "balance_due" };
    case "grace": {
      const expiredOn = params.get("x") ?? "";
      if (!isCalendarDate(expiredOn)) return null;
      return {
        kind: "grace",
        expiredOn,
        renewBy: addDays(expiredOn, GRACE_PERIOD_DAYS),
      };
    }
    default:
      return null;
  }
}

/** Rewards reached, as `id:standing` pairs; anything unrecognized is dropped. */
function readQualified(params: URLSearchParams): QualifiedReward[] {
  const found: QualifiedReward[] = [];
  for (const pair of (params.get("q") ?? "").split(",")) {
    const [id, standing] = pair.split(":");
    const reward = findReward(id);
    if (reward && REWARD_STANDINGS.includes(standing as RewardStanding)) {
      found.push({ rewardId: reward.id, standing: standing as RewardStanding });
    }
  }
  return found;
}
