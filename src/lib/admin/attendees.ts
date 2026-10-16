import type { TidyClient } from "../tidyhq/client";
import { findEventGroup } from "../tidyhq/eventGroups";
import type { Contact } from "../tidyhq/types";
import type { AdminEventPage } from "./eventPage";

/** How often the event page reloads itself while check-in is live. */
export const ATTENDEE_REFRESH_SECONDS = 30;

/**
 * How long before check-in opens the page starts refreshing, so the list is
 * already live when the first member arrives.
 */
export const ATTENDEE_REFRESH_LEAD_MINUTES = 30;

export interface Attendee {
  id: string;
  name: string;
}

export type AttendeesView =
  | { kind: "list"; count: number; people: Attendee[] }
  /** The event has no attendance group, so there's no list to show. */
  | { kind: "no_group" };

function nameOf(contact: Contact): string {
  const display = contact.display_name.trim();
  if (display) return display;
  const full = `${contact.first_name} ${contact.last_name}`.trim();
  return full || "Unnamed member";
}

/**
 * Who has checked in to the event: every contact in its attendance group,
 * sorted alphabetically by name. `listGroupContacts` follows every page of
 * TidyHQ's answer (its contract), so the count is the whole group. Method and
 * time aren't shown: that would take a notes read per attendee. A TidyHQ
 * failure throws; the page decides how to say so.
 */
export async function getEventAttendees(
  client: TidyClient,
  eventId: string,
): Promise<AttendeesView> {
  const groupId = findEventGroup({ id: eventId });
  if (groupId === null) return { kind: "no_group" };
  const contacts = await client.listGroupContacts(groupId);
  const people = contacts
    .map((c) => ({ id: c.id, name: nameOf(c) }))
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name, "en", { sensitivity: "base" }) ||
        a.id.localeCompare(b.id),
    );
  return { kind: "list", count: people.length, people };
}

/**
 * Seconds between automatic reloads of the event page, or null for none. Only
 * while check-in is open or about to open (within
 * `ATTENDEE_REFRESH_LEAD_MINUTES`): a page left open after the event, or days
 * early, shouldn't keep asking TidyHQ for a list that won't change. Nothing
 * for an event members can't check in to. A reload that lands after check-in
 * closes shows the final list and no longer asks for another.
 */
export function attendeeRefreshSeconds(
  event: Pick<AdminEventPage, "checkin" | "window">,
  now: Date,
): number | null {
  if (event.checkin === "open") return ATTENDEE_REFRESH_SECONDS;
  if (event.checkin === "not_yet" && event.window.opensAt) {
    const leadMs = ATTENDEE_REFRESH_LEAD_MINUTES * 60_000;
    if (event.window.opensAt.getTime() - now.getTime() <= leadMs) {
      return ATTENDEE_REFRESH_SECONDS;
    }
  }
  return null;
}
