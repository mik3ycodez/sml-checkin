import { isTidyError } from "../tidyhq/errors";
import {
  checkinBlocker,
  isCheckinOpen,
  type CheckinBlocker,
  resolveCheckinWindow,
  type CheckinStatus,
  type CheckinWindow,
  type IgnoredWindowReason,
} from "../tidyhq/checkinWindow";
import type { TidyClient } from "../tidyhq/client";
import { checkinPath } from "../checkin/paths";
import { blankToNull } from "./events";

/** Why an event gets no QR code: the reasons check-in can never open. */
export type NoQrReason = CheckinBlocker;

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
  /**
   * Whether check-in is open right now, by `window`, or `unavailable` when
   * members can't check in whatever the window says (any reason in `qr`), so
   * the page never says "open" for an event whose scans all fail.
   */
  checkin: CheckinStatus | "unavailable";
  /**
   * What the QR code opens, as a path on this site (the page adds the site's
   * origin), or why there's no code.
   */
  qr: { kind: "qr"; path: string } | { kind: "none"; reason: NoQrReason };
}

/**
 * What the admin event page shows, or null if TidyHQ has no such event. The
 * check-in window and why it was ignored come from the same function check-in
 * uses, so what the page warns about is what check-in does. A QR code is only
 * offered for an event that's not archived, has an attendance group, and can
 * open: a code for any other event would send members to a dead end.
 * Archived events are refused by check-in too, so the page and the door
 * agree. A closed window still gets its code (the admin can fix the window in
 * TidyHQ, and a printed code stays valid). Other TidyHQ failures throw.
 */
export async function getAdminEventPage(
  client: TidyClient,
  eventId: string,
  { now }: { now: Date },
): Promise<AdminEventPage | null> {
  // Both reads need only the id, so they go out together. An unknown event is
  // a 404 from either one.
  let event, set;
  try {
    [event, set] = await Promise.all([
      client.getEvent(eventId),
      client.getEventCheckinWindow(eventId),
    ]);
  } catch (error) {
    if (isTidyError(error, 404)) return null;
    throw error;
  }
  const { window, ignored } = resolveCheckinWindow(set, event);

  const blocker = checkinBlocker(event, window);
  const qr: AdminEventPage["qr"] = blocker
    ? { kind: "none", reason: blocker }
    : { kind: "qr", path: checkinPath(event.id) };

  return {
    id: event.id,
    name: blankToNull(event.name),
    location: blankToNull(event.location),
    startAt: event.start_at,
    endAt: event.end_at,
    archived: event.archived,
    window,
    windowWarning: ignored,
    checkin: qr.kind === "qr" ? isCheckinOpen(window, now) : "unavailable",
    qr,
  };
}
