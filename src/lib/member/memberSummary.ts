import { findContact } from "../checkin/checkIn";
import { hasActiveMembership, isRenewalDue } from "../membership";
import type { TidyClient } from "../tidyhq/client";
import { readPoints } from "../tidyhq/customFields";
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
   * TidyHQ has no membership of any kind on record for them. The page shows
   * a "become a member" message linking to SML's TidyHQ.
   */
  | { status: "not_member"; name: string; points: number | null }
  /** The session names a contact TidyHQ no longer has; sign in again. */
  | { status: "unknown_contact" };

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

/**
 * What the member status page shows. Read-only. The shown membership is the
 * active one ending latest; with none active, the one that ended most
 * recently, so expired members still see their last level. No membership
 * at all is `not_member`.
 */
export async function getMemberSummary(
  client: TidyClient,
  { contactId, now }: { contactId: string; now: Date },
): Promise<MemberSummary> {
  const contact = await findContact(client, contactId);
  if (!contact) return { status: "unknown_contact" };

  const memberships = await client.getMemberships(contactId);
  const active = memberships.filter((m) => hasActiveMembership([m], now));
  const shown = latestEnding(active) ?? latestEnding(memberships);
  if (!shown) {
    return {
      status: "not_member",
      name: contact.display_name,
      points: readPoints(contact),
    };
  }
  const level = (await client.getMembershipLevel(shown.membership_level_id))
    .name;

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
