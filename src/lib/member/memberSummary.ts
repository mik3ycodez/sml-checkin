import { findContact } from "../checkin/checkIn";
import { hasActiveMembership, isRenewalDue } from "../membership";
import type { TidyClient } from "../tidyhq/client";
import { readPoints } from "../tidyhq/customFields";
import type { Membership } from "../tidyhq/types";

export type MemberSummary =
  | {
      status: "ok";
      name: string;
      /** Null only if TidyHQ has no membership on record for them. */
      level: string | null;
      /** `YYYY-MM-DD`; null if open-ended or there is no membership. */
      membershipEndsOn: string | null;
      membership: "active" | "renew_soon" | "expired";
      /** Null if the stored total is unreadable; the page explains. */
      points: number | null;
    }
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
 * recently, so expired members still see their last level.
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
  const level = shown
    ? (await client.getMembershipLevel(shown.membership_level_id)).name
    : null;

  const membership =
    active.length === 0
      ? "expired"
      : isRenewalDue(shown!.end_date, now)
        ? "renew_soon"
        : "active";

  return {
    status: "ok",
    name: contact.display_name,
    level,
    membershipEndsOn: shown?.end_date ?? null,
    membership,
    points: readPoints(contact),
  };
}
