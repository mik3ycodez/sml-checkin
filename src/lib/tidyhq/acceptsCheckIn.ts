import type { Event } from "./types";

/**
 * Whether an event takes check-ins at all. The one place that decides, used
 * by `checkinBlocker` (so the admin event page's QR code, the volunteer page
 * and check-in itself all follow it) next to "archived": an event that fails
 * it refuses check-in outright.
 *
 * Today every event in SML's TidyHQ is accepted, shared ones (`shared_from`
 * set) included: milestone 5 plan, decision 5. The go-live checklist confirms
 * no events are shared. If the Board later wants partner events recorded
 * without points, that is a separate rule added then, not this one.
 */
export function acceptsCheckIn(event: Pick<Event, "id">): boolean {
  void event;
  return true;
}
