import { isTidyError } from "../tidyhq/errors";
import { findEventGroup } from "../tidyhq/eventGroups";
import {
  getCheckinWindowDetails,
  isCheckinOpen,
  type CheckinStatus,
  type CheckinWindow,
  type IgnoredWindowReason,
} from "../tidyhq/checkinWindow";
import type { TidyClient } from "../tidyhq/client";
import { checkinUrl } from "@/app/admin/paths";

/** Why an event gets no QR code. */
export type NoQrReason =
  /** Archived in TidyHQ: not an event to run check-in for. */
  | "archived"
  /** No attendance group, so a check-in couldn't be recorded. */
  | "no_group"
  /** Neither an admin window nor the event's own times can open check-in. */
  | "never_opens";

export interface AdminEventPage {
  id: string;
  /** Null if TidyHQ has none (or a blank one). */
  name: string | null;
  /** Null if TidyHQ has none (or a blank one). */
  location: string | null;
  /** ISO timestamps, null if TidyHQ has none. May not be readable. */
  startAt: string | null;
  endAt: string | null;
  archived: boolean;
  /** The window check-in actually uses (see `getCheckinWindowDetails`). */
  window: CheckinWindow;
  /** Why the admin-set window in TidyHQ was ignored, if it was. */
  windowWarning: IgnoredWindowReason | null;
  /** Whether check-in is open right now, by `window`. */
  checkin: CheckinStatus;
  /** The QR code's link, or why there isn't one. */
  qr: { kind: "qr"; url: string } | { kind: "none"; reason: NoQrReason };
}

const blankToNull = (value: string | null) => value?.trim() || null;

/**
 * What the admin event page shows, or null if TidyHQ has no such event. The
 * check-in window and why it was ignored come from the same function check-in
 * uses, so what the page warns about is what check-in does. A QR code is only
 * offered for an event that's not archived, has an attendance group, and can
 * open: a code for any other event would send members to a dead end.
 * A closed window still gets its code (the admin can fix the window in
 * TidyHQ, and a printed code stays valid). Other TidyHQ failures throw.
 */
export async function getAdminEventPage(
  client: TidyClient,
  eventId: string,
  { origin, now }: { origin: string; now: Date },
): Promise<AdminEventPage | null> {
  let event;
  try {
    event = await client.getEvent(eventId);
  } catch (error) {
    if (isTidyError(error, 404)) return null;
    throw error;
  }
  const { window, ignored } = await getCheckinWindowDetails(client, event);

  let qr: AdminEventPage["qr"];
  if (event.archived) qr = { kind: "none", reason: "archived" };
  else if (findEventGroup(event) === null) {
    qr = { kind: "none", reason: "no_group" };
  } else if (!window.opensAt || !window.closesAt) {
    qr = { kind: "none", reason: "never_opens" };
  } else qr = { kind: "qr", url: checkinUrl(origin, event.id) };

  return {
    id: event.id,
    name: blankToNull(event.name),
    location: blankToNull(event.location),
    startAt: event.start_at,
    endAt: event.end_at,
    archived: event.archived,
    window,
    windowWarning: ignored,
    checkin: isCheckinOpen(window, now),
    qr,
  };
}
