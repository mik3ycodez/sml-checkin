import type { MembershipStanding } from "./membership";
import { REWARDS, type Reward } from "./points";
import { readRewardIssued } from "./tidyhq/customFields";
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
 * How a membership affects a reward. Colors need a current, fully paid
 * membership, so a balance due, a grace period, a lapsed membership and no
 * membership at all each get their own wording. Only current, balance-due
 * and grace members can still earn points.
 */
export type RewardStanding =
  "current" | "balance_due" | "grace" | "lapsed" | "non_member";

export function rewardStanding(standing: MembershipStanding): RewardStanding {
  switch (standing.kind) {
    case "current":
      return standing.balanceDue ? "balance_due" : "current";
    case "grace":
      return "grace";
    case "lapsed":
      return "lapsed";
    // No counted membership (e.g. migrated points, never joined in TidyHQ).
    case "none":
      return "non_member";
  }
}

export const REWARD_STANDINGS: readonly RewardStanding[] = [
  "current",
  "balance_due",
  "grace",
  "lapsed",
  "non_member",
];

export function rewardMessage(
  reward: Reward,
  status: RewardStatus,
  standing: RewardStanding,
): string {
  switch (status.kind) {
    case "issued":
      return `${reward.name.charAt(0).toUpperCase()}${reward.name.slice(1)} received ✓`;
    case "progress": {
      const more = `${status.remaining} more ${status.remaining === 1 ? "point" : "points"}`;
      switch (standing) {
        case "current":
        case "balance_due":
        case "grace":
          return `${more} until you qualify for ${reward.name}.`;
        // Can't earn points until they renew or join, so no bare countdown.
        case "lapsed":
          return `Renew your membership to keep earning points toward ${reward.name}. ${more} needed.`;
        case "non_member":
          return `Members earn ${reward.name} at ${reward.pointsRequired} points. Become a member to start earning.`;
      }
    }
    case "qualified":
      switch (standing) {
        case "current":
          return `You qualify for ${reward.name}! A Board member will connect with you to distribute your ${reward.name}.`;
        case "balance_due":
          return `You qualify for ${reward.name}. You will need to complete payment before receiving ${reward.name}.`;
        case "grace":
        case "lapsed":
        case "non_member":
          return `You qualify for ${reward.name}. You will need to renew before receiving ${reward.name}.`;
      }
  }
}

export interface RewardEntry {
  reward: Reward;
  status: RewardStatus;
}

/**
 * Every reward whose status can be read from the contact. `points` is the
 * caller's own read of the stored total, so both come from the same read.
 */
export function rewardEntries(
  contact: Pick<Contact, "custom_fields">,
  points: number | null,
): RewardEntry[] {
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
 * The rewards `awarded` points will reach, from where the member stood before
 * them: short by no more than `awarded`, and not yet issued.
 */
export function newlyQualified(
  entries: readonly RewardEntry[],
  awarded: number,
): Reward[] {
  return entries
    .filter(
      (e) => e.status.kind === "progress" && e.status.remaining <= awarded,
    )
    .map((e) => e.reward);
}

/**
 * Where the member stands on `reward` once `awarded` more points land, from
 * the entries read before the write (`rewardEntries`, at `stored` points).
 * The same `rewardStatus` rule as `/me` and the confirmation, so the colors
 * group can't disagree with them. Null when we can't tell (issued unreadable).
 */
export function rewardStatusAfter(
  entries: readonly RewardEntry[],
  reward: Reward,
  stored: number,
  awarded: number,
): RewardStatus | null {
  const entry = entries.find((e) => e.reward.id === reward.id);
  // No entry means the issued field was unreadable; otherwise the entry's
  // kind says whether it was issued.
  const issued = entry ? entry.status.kind === "issued" : null;
  return rewardStatus(reward, stored + awarded, issued);
}

/** A reward a check-in just reached, and how the member stood when it did. */
export interface QualifiedReward {
  rewardId: Reward["id"];
  standing: RewardStanding;
}

export function findReward(id: string): Reward | undefined {
  return REWARDS.find((r) => r.id === id);
}
