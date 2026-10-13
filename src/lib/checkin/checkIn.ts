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
import { findEventGroup } from "../tidyhq/eventGroups";
import type { Event } from "../tidyhq/types";

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
  let event: Event;
  try {
    event = await client.getEvent(eventId);
  } catch (error) {
    if (error instanceof TidyError && error.status === 404) return null;
    throw error;
  }
  const groupId = findEventGroup(event);
  return groupId ? { event, groupId } : null;
}

/**
 * Self or staff check-in for one member at one event. Returns what happened
 * rather than throwing, so pages only need to render the result. Unexpected
 * TidyHQ failures (e.g. an unknown contact) still throw.
 *
 * Order: event → existing check-in → check-in window → membership. An
 * existing check-in comes first so a member who reloads the page after the
 * window closes, or after their membership lapses, still sees it.
 *
 * The stored points field is the source of truth (it includes migrated
 * balances and admin adjustments), so points are added to it, never
 * recalculated. A member already in the event's group gets nothing. The group
 * add happens before the points write, so a failure in between may miss a
 * point but a retry can never award it twice.
 */
export async function checkIn(
  client: TidyClient,
  { eventId, contactId, role = "attendee", now }: CheckInInput,
): Promise<CheckInResult> {
  const found = await findEvent(client, eventId);
  if (!found) return { status: "unknown_event" };
  const { event, groupId } = found;
  const eventName = event.name;

  // The window is only needed if not already checked in, but fetching it
  // alongside saves a round trip on the common path.
  const [contact, attendees, window] = await Promise.all([
    client.getContact(contactId),
    client.listGroupContacts(groupId),
    getCheckinWindow(client, event),
  ]);
  const name = contact.display_name;
  if (attendees.some((c) => c.id === contactId)) {
    const total = readPoints(contact);
    return { status: "already_checked_in", name, eventName, total };
  }

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
  const pointsAwarded = POINTS_PER_CHECKIN[role];
  const total = readPoints(contact) + pointsAwarded;
  await client.updateContact(contactId, buildPointsPatch(total));
  return { status: "checked_in", name, eventName, pointsAwarded, total };
}
