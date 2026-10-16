import { contactName } from "../tidyhq/contactName";
import type { TidyClient } from "../tidyhq/client";
import type { AdminEventPage } from "./eventPage";

/**
 * How often the event page reloads itself while check-in is live: 30 seconds,
 * except under `E2E=1` (set only by playwright.config.ts), where it is 2 so the
 * end-to-end specs that wait for a real reload don't take 30 seconds each.
 */
export function refreshIntervalSeconds(
  env: Record<string, string | undefined> = process.env,
): number {
  return env.E2E === "1" ? 2 : 30;
}

/**
 * How long before check-in opens the page starts refreshing, so the list is
 * already live when the first member arrives.
 */
export const ATTENDEE_REFRESH_LEAD_MINUTES = 30;

export interface Attendee {
  id: string;
  name: string;
}

/**
 * Who has checked in: every contact in the attendance group, once each (live
 * paging can repeat a row when the group changes between pages), sorted
 * alphabetically by name. `listGroupContacts` follows every page of TidyHQ's
 * answer (its contract), so this is the whole group. The caller decides
 * whether the event has a group at all and passes its id. Method and time
 * aren't shown: that would take a notes read per attendee. A TidyHQ failure
 * throws; the page decides how to say so.
 */
export async function getEventAttendees(
  client: TidyClient,
  groupId: string,
): Promise<Attendee[]> {
  const contacts = await client.listGroupContacts(groupId);
  const byId = new Map<string, Attendee>();
  for (const c of contacts) {
    if (!byId.has(c.id)) byId.set(c.id, { id: c.id, name: contactName(c) });
  }
  return [...byId.values()].sort(
    (a, b) =>
      a.name.localeCompare(b.name, "en", { sensitivity: "base" }) ||
      a.id.localeCompare(b.id),
  );
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
  if (event.checkin === "open") return refreshIntervalSeconds();
  if (event.checkin === "not_yet" && event.window.opensAt) {
    const leadMs = ATTENDEE_REFRESH_LEAD_MINUTES * 60_000;
    if (event.window.opensAt.getTime() - now.getTime() <= leadMs) {
      return refreshIntervalSeconds();
    }
  }
  return null;
}
