import {
  checkinBlocker,
  isCheckinOpen,
  resolveCheckinWindow,
  type CheckinBlocker,
  type CheckinWindow,
} from "../tidyhq/checkinWindow";
import type { TidyClient } from "../tidyhq/client";
import { isTidyError } from "../tidyhq/errors";
import { findEventGroup } from "../tidyhq/eventGroups";
import type { Event } from "../tidyhq/types";

/** What was read to decide, so the page doesn't read it again. */
export interface StaffEventLoaded {
  event: Event;
  groupId: string;
  window: CheckinWindow;
}

/**
 * Whether a volunteer may still work an event's staff check-in page.
 * `ended` once check-in has closed, or for any reason it can never open
 * (`checkinBlocker`, the same rule as the admin event page's QR code). Never
 * just because check-in hasn't opened yet: volunteers set up early.
 * `loaded` is set unless the event has no attendance group. Unexpected
 * TidyHQ failures throw.
 */
export type StaffEventState =
  | {
      status: "running";
      eventName: string | null;
      loaded: StaffEventLoaded;
    }
  | {
      status: "ended";
      eventName: string | null;
      reason: CheckinBlocker | "closed";
      loaded: StaffEventLoaded | null;
    }
  | { status: "unknown_event" };

export async function staffEventState(
  client: TidyClient,
  eventId: string,
  now: Date,
): Promise<StaffEventState> {
  let event, set;
  try {
    [event, set] = await Promise.all([
      client.getEvent(eventId),
      client.getEventCheckinWindow(eventId),
    ]);
  } catch (error) {
    if (isTidyError(error, 404)) return { status: "unknown_event" };
    throw error;
  }
  const { window } = resolveCheckinWindow(set, event);
  const groupId = findEventGroup(event);
  const loaded = groupId ? { event, groupId, window } : null;
  const eventName = event.name;

  const blocker = checkinBlocker(event, window);
  if (blocker) return { status: "ended", eventName, reason: blocker, loaded };
  if (isCheckinOpen(window, now) === "closed") {
    return { status: "ended", eventName, reason: "closed", loaded };
  }
  return { status: "running", eventName, loaded: loaded! };
}
