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

export function resolveEventGroup(event: Pick<Event, "id">): string {
  const groupId = EVENT_GROUPS[event.id];
  if (!groupId) {
    throw new TidyError(404, `No attendance group for event ${event.id}`);
  }
  return groupId;
}
