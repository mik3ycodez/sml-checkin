import { seattleDate } from "../dates";
import {
  countsAsMembership,
  isActiveMembership,
  isRenewalDue,
} from "../membership";
import type { TidyClient } from "../tidyhq/client";
import { findContact } from "../tidyhq/contacts";
import { readPoints } from "../tidyhq/customFields";
import { isTidyError } from "../tidyhq/errors";
import type { Membership } from "../tidyhq/types";

export type MemberSummary =
  | {
      status: "ok";
      name: string;
      level: string;
      /** `YYYY-MM-DD`; null if open-ended. */
      membershipEndsOn: string | null;
      membership: "active" | "renew_soon" | "expired";
      /** Null if the stored total is unreadable; the page explains. */
      points: number | null;
    }
  /**
   * TidyHQ has no real membership on record for them: none at all, or only
   * pending or cancelled ones. The page shows
   * a "become a member" message linking to SML's TidyHQ.
   */
  | { status: "not_member"; name: string; points: number | null }
  /** The session names a contact TidyHQ no longer has; sign in again. */
  | { status: "unknown_contact" };

/** Shown when TidyHQ no longer has the membership's level. */
export const UNKNOWN_LEVEL_NAME = "Member";

/** Later end date first; open-ended (null) counts as the latest. */
function endsLater(a: Membership, b: Membership): boolean {
  if (a.end_date === null) return b.end_date !== null;
  return b.end_date !== null && a.end_date > b.end_date;
}

function latestEnding(memberships: Membership[]): Membership | null {
  let best: Membership | null = null;
  for (const m of memberships) {
    if (best === null || endsLater(m, best)) best = m;
  }
  return best;
}

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
 * What the member status page shows. Read-only. Only memberships that count
 * (not pending or cancelled, already started) are considered. The shown one
 * is the active one ending latest; with none active, the one that ended most
 * recently, so expired members still see their last level. No counted
 * membership is `not_member`.
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

  const today = seattleDate(now);
  const counted = memberships.filter((m) => countsAsMembership(m, today));
  const active = counted.filter((m) => isActiveMembership(m, today));
  const shown = latestEnding(active) ?? latestEnding(counted);
  if (!shown) {
    return {
      status: "not_member",
      name: contact.display_name,
      points: readPoints(contact),
    };
  }
  const level = await levelName(client, shown.membership_level_id);

  const membership =
    active.length === 0
      ? "expired"
      : isRenewalDue(shown.end_date, now)
        ? "renew_soon"
        : "active";

  return {
    status: "ok",
    name: contact.display_name,
    level,
    membershipEndsOn: shown.end_date,
    membership,
    points: readPoints(contact),
  };
}
