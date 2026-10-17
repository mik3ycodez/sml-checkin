import type { Event } from "./types";

/**
 * Whether checking in to this event earns points. The one place that decides,
 * used by check-in and the admin event list, so changing the rule is a change
 * here only.
 *
 * Today every event in SML's TidyHQ counts, shared ones (`shared_from` set)
 * included: milestone 5 plan, decision 5. The go-live checklist confirms no
 * events are shared; if SML later wants shared events not to count, the rule
 * goes here.
 */
export function countsForPoints(event: Pick<Event, "id">): boolean {
  void event;
  return true;
}
