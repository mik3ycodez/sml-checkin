import type { MembershipNotice, MembershipStanding } from "./membership";
import { REWARDS, type Reward } from "./points";
import { readPoints, readRewardIssued } from "./tidyhq/customFields";
import type { Contact } from "./tidyhq/types";

/** Where a member stands on one reward. Display only; nothing here is written. */
export type RewardStatus =
  | { kind: "progress"; remaining: number }
  | { kind: "qualified" }
  | { kind: "issued" };

/**
 * Issued wins over everything, even under the required points (the Board may
 * issue early, or points may later be adjusted). Null when we can't tell:
 * an unreadable issued field, or unreadable points with nothing issued.
 * Saying nothing beats telling someone colors are coming when they already
 * have them, or the reverse.
 */
export function rewardStatus(
  reward: Reward,
  points: number | null,
  issued: boolean | null,
): RewardStatus | null {
  if (issued === true) return { kind: "issued" };
  if (issued === null || points === null) return null;
  return points >= reward.pointsRequired
    ? { kind: "qualified" }
    : { kind: "progress", remaining: reward.pointsRequired - points };
}

/**
 * How a membership affects handing over a reward. Colors need a current,
 * fully paid membership, so a balance due, a grace period and a lapsed
 * membership each get their own wording.
 */
export type RewardStanding = "current" | "balance_due" | "grace" | "lapsed";

export function rewardStanding(standing: MembershipStanding): RewardStanding {
  switch (standing.kind) {
    case "current":
      return standing.balanceDue ? "balance_due" : "current";
    case "grace":
      return "grace";
    case "lapsed":
    case "none":
      return "lapsed";
  }
}

/**
 * The standing at check-in time, from the notice that came with the check-in:
 * only current (no notice), balance due and grace can check in.
 */
export function standingFromNotice(
  notice: MembershipNotice | null | undefined,
): RewardStanding {
  if (!notice) return "current";
  return notice.kind === "balance_due" ? "balance_due" : "grace";
}

export function rewardMessage(
  reward: Reward,
  status: RewardStatus,
  standing: RewardStanding,
): string {
  switch (status.kind) {
    case "issued":
      return `${reward.name.charAt(0).toUpperCase()}${reward.name.slice(1)} issued.`;
    case "progress":
      return `${status.remaining} more ${status.remaining === 1 ? "point" : "points"} until you qualify for ${reward.name}.`;
    case "qualified":
      switch (standing) {
        case "current":
          return `You qualify for ${reward.name}! A Board member will connect with you to distribute your ${reward.name}.`;
        case "balance_due":
          return `You qualify for ${reward.name}. You will need to complete payment before receiving ${reward.name}.`;
        case "grace":
        case "lapsed":
          return `You qualify for ${reward.name}. You will need to renew before receiving ${reward.name}.`;
      }
  }
}

export interface RewardEntry {
  reward: Reward;
  status: RewardStatus;
}

/** Every reward whose status can be read from the contact. */
export function rewardEntries(contact: Contact): RewardEntry[] {
  const points = readPoints(contact);
  const entries: RewardEntry[] = [];
  for (const reward of REWARDS) {
    const status = rewardStatus(
      reward,
      points,
      readRewardIssued(contact, reward.id),
    );
    if (status) entries.push({ reward, status });
  }
  return entries;
}

/**
 * The qualified rewards this check-in's points just earned: qualified now,
 * but not before `awarded` was added to `total`.
 */
export function newlyQualified(
  entries: readonly RewardEntry[],
  { total, awarded }: { total: number; awarded: number },
): RewardEntry[] {
  return entries.filter(
    (e) =>
      e.status.kind === "qualified" &&
      total - awarded < e.reward.pointsRequired,
  );
}
