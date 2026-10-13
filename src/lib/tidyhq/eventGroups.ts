import { TidyError } from "./errors";
import type { Event } from "./types";

// The only place that knows how an event links to its attendance contact group.
//
// Unknown until live access. The v2 spec's `Event.group_id` is an attendee
// group TidyHQ keeps "in step with the event's attendees" (ticket holders), so
// manual adds may be undone by its sync. Until that's confirmed we use an
// explicit mapping; switching to `event.group_id` is a change to this file only.
const EVENT_GROUPS: Record<string, string> = {
  ev_pub_night: "grp_pub_night",
  ev_tonight: "grp_social_night",
  ev_bootblack_social: "grp_bootblack_social",
  ev_bar_night: "grp_bar_night",
  ev_leather_brunch: "grp_leather_brunch",
};

/** The event's attendance group, or null if it has none. */
export function findEventGroup(event: Pick<Event, "id">): string | null {
  return EVENT_GROUPS[event.id] ?? null;
}

/** Like `findEventGroup`, but throws 404 if the event has no group. */
export function resolveEventGroup(event: Pick<Event, "id">): string {
  const groupId = findEventGroup(event);
  if (!groupId) {
    throw new TidyError(404, `No attendance group for event ${event.id}`);
  }
  return groupId;
}

/**
 * Every event's attendance group. Points are counted from this list rather
 * than from `listEvents()`, so an event missing from the event listing
 * (paginated, archived) can't drop a member's total.
 */
export function listAttendanceGroups(): { eventId: string; groupId: string }[] {
  return Object.entries(EVENT_GROUPS).map(([eventId, groupId]) => ({
    eventId,
    groupId,
  }));
}
