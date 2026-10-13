import type { CheckInFailure } from "./checkIn";

/**
 * Records a failed check-in in the server log, so staff can trace it (above
 * all a `points_write` failure, where the member was added to the group but
 * missed their point). Logs ids, the step and TidyHQ's status only: never the
 * error message, a token, or the session.
 */
export function logCheckinFailure({
  eventId,
  contactId,
  failure,
}: {
  eventId: string;
  contactId: string;
  failure: CheckInFailure;
}): void {
  console.error("check-in failed", {
    eventId,
    contactId,
    step: failure.step,
    tidyStatus: failure.tidyStatus,
  });
}
