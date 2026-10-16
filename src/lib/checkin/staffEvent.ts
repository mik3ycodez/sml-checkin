import { getCheckinWindow, isCheckinOpen } from "../tidyhq/checkinWindow";
import type { TidyClient } from "../tidyhq/client";
import { isTidyError } from "../tidyhq/errors";
import { findEventGroup } from "../tidyhq/eventGroups";

/**
 * Whether a volunteer may still work an event's staff check-in page.
 * `ended` once check-in has closed, the event is archived, or check-in can
 * never open (no attendance group, no usable window or event times). Never
 * just because check-in hasn't opened yet: volunteers set up early. Unexpected
 * TidyHQ failures throw.
 */
export type StaffEventState =
  | { status: "running"; eventName: string | null }
  | { status: "ended"; eventName: string | null }
  | { status: "unknown_event" };

export async function staffEventState(
  client: TidyClient,
  eventId: string,
  now: Date,
): Promise<StaffEventState> {
  let event;
  try {
    event = await client.getEvent(eventId);
  } catch (error) {
    if (isTidyError(error, 404)) return { status: "unknown_event" };
    throw error;
  }
  if (event.archived || findEventGroup(event) === null) {
    return { status: "ended", eventName: event.name };
  }
  // A window that can't open reads as "closed" here, so it ends the mode too.
  const window = await getCheckinWindow(client, event);
  const status = isCheckinOpen(window, now) === "closed" ? "ended" : "running";
  return { status, eventName: event.name };
}
