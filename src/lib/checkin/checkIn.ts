import { hasActiveMembership } from "../membership";
import {
  POINTS_PER_CHECKIN,
  type CheckInMethod,
  type CheckInRole,
} from "../points";
import { getCheckinWindow, isCheckinOpen } from "../tidyhq/checkinWindow";
import type { TidyClient } from "../tidyhq/client";
import { buildPointsPatch, readPoints } from "../tidyhq/customFields";
import { TidyError } from "../tidyhq/errors";
import { resolveEventGroup } from "../tidyhq/eventGroups";
import type { Contact, Event } from "../tidyhq/types";
import { recalculatePoints } from "./recalculatePoints";

export interface CheckInInput {
  eventId: string;
  contactId: string;
  role?: CheckInRole;
  /** Not saved yet; there's nowhere to record it until notes or a database. */
  method?: CheckInMethod;
  now: Date;
}

export type CheckInResult =
  | {
      status: "checked_in";
      name: string;
      eventName: string | null;
      pointsAwarded: number;
      total: number;
    }
  | {
      status: "already_checked_in";
      name: string;
      eventName: string | null;
      total: number;
    }
  | { status: "membership_inactive"; name: string }
  | { status: "not_open"; eventName: string | null; opensAt: Date }
  | { status: "closed"; eventName: string | null }
  | { status: "unknown_event" };

/** The event and its attendance group, or null if either is missing. */
async function findEvent(
  client: TidyClient,
  eventId: string,
): Promise<{ event: Event; groupId: string } | null> {
  try {
    const event = await client.getEvent(eventId);
    return { event, groupId: resolveEventGroup(event) };
  } catch (error) {
    if (error instanceof TidyError && error.status === 404) return null;
    throw error;
  }
}

/**
 * Recalculates the member's total from attendance and writes it if it differs
 * from the stored value, so a retry after a half-finished check-in repairs it.
 */
async function syncPoints(client: TidyClient, contact: Contact) {
  const total = await recalculatePoints(client, contact.id);
  if (total !== readPoints(contact)) {
    await client.updateContact(contact.id, buildPointsPatch(total));
  }
  return total;
}

/**
 * Self or staff check-in for one member at one event. Returns what happened
 * rather than throwing, so pages only need to render the result. Unexpected
 * TidyHQ failures (e.g. an unknown contact) still throw.
 *
 * Order: event → existing check-in → check-in window → membership. An
 * existing check-in comes first so a member who reloads the page after the
 * window closes, or after their membership lapses, still sees it.
 */
export async function checkIn(
  client: TidyClient,
  { eventId, contactId, role = "attendee", now }: CheckInInput,
): Promise<CheckInResult> {
  const found = await findEvent(client, eventId);
  if (!found) return { status: "unknown_event" };
  const { event, groupId } = found;
  const eventName = event.name;

  const [contact, attendees] = await Promise.all([
    client.getContact(contactId),
    client.listGroupContacts(groupId),
  ]);
  const name = contact.display_name;
  if (attendees.some((c) => c.id === contactId)) {
    const total = await syncPoints(client, contact);
    return { status: "already_checked_in", name, eventName, total };
  }

  const window = await getCheckinWindow(client, event);
  const open = isCheckinOpen(window, now);
  if (open === "not_yet") {
    return { status: "not_open", eventName, opensAt: window.opensAt! };
  }
  if (open === "closed") return { status: "closed", eventName };

  const memberships = await client.getMemberships(contactId);
  if (!hasActiveMembership(memberships, now)) {
    return { status: "membership_inactive", name };
  }

  await client.addContactToGroup(groupId, contactId);
  const total = await syncPoints(client, contact);
  return {
    status: "checked_in",
    name,
    eventName,
    pointsAwarded: POINTS_PER_CHECKIN[role],
    total,
  };
}
