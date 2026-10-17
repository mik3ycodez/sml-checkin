import type { Event } from "./types";

// The only place that knows how an event links to its attendance contact group.
//
// LIVE-UNKNOWN(event-group-link): how SML's events link to their attendance
// groups. The link rides on the event itself (`attendance_group_id`): the mock
// fills it from its seed, and `HttpTidyClient` leaves it unset, so in live
// mode no event has a group and check-in refuses (it fails closed). The
// tempting guess, the v2 spec's `Event.group_id`, is a group "kept in step
// with the event's attendees" (ticket holders). If TidyHQ's sync removed a
// member we added, their next scan would look like a new check-in and award a
// second point, so we don't use it. Go-live checklist item 3 decides the rule;
// it then goes in the HTTP client's event parser, and this file stays as it is.

/** The event's attendance group, or null if it has none. */
export function findEventGroup(
  event: Pick<Event, "attendance_group_id">,
): string | null {
  return event.attendance_group_id || null;
}
