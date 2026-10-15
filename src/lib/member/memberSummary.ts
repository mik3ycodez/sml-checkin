import { logInconsistentMemberships } from "../logInconsistentMemberships";
import {
  isRenewalDue,
  membershipNotice,
  membershipStanding,
  type MembershipNotice,
  type MembershipStanding,
} from "../membership";
import type { Reward } from "../points";
import {
  rewardEntries,
  rewardMessage,
  rewardStanding,
  type RewardStatus,
} from "../rewards";
import type { TidyClient } from "../tidyhq/client";
import { findContact } from "../tidyhq/contacts";
import { readPoints } from "../tidyhq/customFields";
import { isTidyError } from "../tidyhq/errors";
import type { Contact, Membership } from "../tidyhq/types";

/** How the status page describes a member's membership. */
export type MembershipStatus =
  "active" | "renew_soon" | "balance_due" | "grace" | "expired";

export type MemberSummary =
  | {
      status: "ok";
      name: string;
      level: string;
      /** `YYYY-MM-DD`; null if open-ended. */
      membershipEndsOn: string | null;
      /**
       * `balance_due` (partial, end date still ahead) takes priority over
       * `renew_soon`. `grace` is past the end date but within
       * `GRACE_PERIOD_DAYS`; `expired` is beyond it.
       */
      membership: "active" | "renew_soon" | "balance_due" | "grace" | "expired";
      /** The balance-due or grace message, with its dates; otherwise null. */
      notice: MembershipNotice | null;
      /** Null if the stored total is unreadable; the page explains. */
      points: number | null;
      /** Rewards we can read; one that can't be read is left out. */
      rewards: MemberReward[];
    }
  /**
   * TidyHQ has no real membership on record for them: none at all, or only
   * pending or cancelled ones. The page shows
   * a "become a member" message linking to SML's TidyHQ.
   */
  | {
      status: "not_member";
      name: string;
      points: number | null;
      /** Worded for a non-member: colors need a membership first. */
      rewards: MemberReward[];
    }
  /** The session names a contact TidyHQ no longer has; sign in again. */
  | { status: "unknown_contact" };

export interface MemberReward {
  reward: Reward;
  status: RewardStatus;
  /** What the page says about it, given the member's membership standing. */
  message: string;
}

/** Shown when TidyHQ no longer has the membership's level. */
export const UNKNOWN_LEVEL_NAME = "Member";

/** The contact's memberships, or null if TidyHQ doesn't have the contact. */
async function findMemberships(
  client: TidyClient,
  contactId: string,
): Promise<Membership[] | null> {
  try {
    return await client.getMemberships(contactId);
  } catch (error) {
    if (isTidyError(error, 404)) return null;
    throw error;
  }
}

/** The level's name, or a generic one if TidyHQ no longer has the level. */
async function levelName(client: TidyClient, levelId: string): Promise<string> {
  try {
    return (await client.getMembershipLevel(levelId)).name;
  } catch (error) {
    if (isTidyError(error, 404)) return UNKNOWN_LEVEL_NAME;
    throw error;
  }
}

/**
 * What the member status page shows. Read-only. Uses `membershipStanding`,
 * the same rule check-in uses: the counted membership with the latest end
 * date (not pending or cancelled, already started). Expired members still
 * see their last level. No counted membership is `not_member`.
 */
export async function getMemberSummary(
  client: TidyClient,
  { contactId, now }: { contactId: string; now: Date },
): Promise<MemberSummary> {
  const [contact, memberships] = await Promise.all([
    findContact(client, contactId),
    findMemberships(client, contactId),
  ]);
  if (!contact || !memberships) return { status: "unknown_contact" };

  logInconsistentMemberships(contactId, memberships, now);
  const standing = membershipStanding(memberships, now);
  const points = readPoints(contact);
  const rewards = memberRewards(contact, points, standing);
  if (standing.kind === "none") {
    return {
      status: "not_member",
      name: contact.display_name,
      points,
      rewards,
    };
  }
  const shown = standing.membership;
  const level = await levelName(client, shown.membership_level_id);

  let membership: MembershipStatus;
  switch (standing.kind) {
    case "current":
      membership = standing.balanceDue
        ? "balance_due"
        : isRenewalDue(standing.endsOn, now)
          ? "renew_soon"
          : "active";
      break;
    case "grace":
      membership = "grace";
      break;
    case "lapsed":
      membership = "expired";
      break;
  }

  return {
    status: "ok",
    name: contact.display_name,
    level,
    membershipEndsOn: standing.endsOn,
    membership,
    notice: membershipNotice(standing),
    points,
    rewards,
  };
}

/** Rewards we can read, with the message for the member's standing. */
function memberRewards(
  contact: Contact,
  points: number | null,
  standing: MembershipStanding,
): MemberReward[] {
  return rewardEntries(contact, points).map(({ reward, status }) => ({
    reward,
    status,
    message: rewardMessage(reward, status, rewardStanding(standing)),
  }));
}
