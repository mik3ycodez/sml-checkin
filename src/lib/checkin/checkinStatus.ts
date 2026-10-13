import type { TidyClient } from "../tidyhq/client";
import { readPoints } from "../tidyhq/customFields";
import { findEvent, readAttendance } from "./checkIn";

export type CheckinStatus =
  | {
      status: "checked_in";
      name: string;
      eventName: string | null;
      /** Null if the stored total is unreadable. */
      total: number | null;
    }
  | { status: "not_checked_in"; name: string; eventName: string | null }
  | { status: "unknown_event" }
  /** The session names a contact TidyHQ no longer has. */
  | { status: "unknown_contact" };

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
  const attendance = await readAttendance(client, found.groupId, contactId);
  if (!attendance) return { status: "unknown_contact" };

  const { contact, checkedIn } = attendance;
  const name = contact.display_name;
  const eventName = found.event.name;
  if (!checkedIn) return { status: "not_checked_in", name, eventName };
  return { status: "checked_in", name, eventName, total: readPoints(contact) };
}
