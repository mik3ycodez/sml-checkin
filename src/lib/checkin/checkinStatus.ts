import type { TidyClient } from "../tidyhq/client";
import { readPoints } from "../tidyhq/customFields";
import { findEvent } from "./checkIn";

export type CheckinStatus =
  | {
      status: "checked_in";
      name: string;
      eventName: string | null;
      /** Null if the stored total is unreadable. */
      total: number | null;
    }
  | { status: "not_checked_in"; name: string; eventName: string | null }
  | { status: "unknown_event" };

/**
 * Whether a member is checked in to an event, and their stored points total,
 * read fresh from TidyHQ. Changes nothing. The result page uses this rather
 * than trusting the URL, so a refresh shows the truth and nothing can be faked.
 */
export async function getCheckinStatus(
  client: TidyClient,
  { eventId, contactId }: { eventId: string; contactId: string },
): Promise<CheckinStatus> {
  const found = await findEvent(client, eventId);
  if (!found) return { status: "unknown_event" };
  const { event, groupId } = found;

  const [contact, attendees] = await Promise.all([
    client.getContact(contactId),
    client.listGroupContacts(groupId),
  ]);
  const name = contact.display_name;
  const eventName = event.name;
  if (!attendees.some((c) => c.id === contactId)) {
    return { status: "not_checked_in", name, eventName };
  }
  return { status: "checked_in", name, eventName, total: readPoints(contact) };
}
