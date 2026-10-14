import type { CheckInFailure } from "./checkIn";

/**
 * Records a failed check-in in the server log, so staff can trace it (above
 * all a `points_write` failure, where the member was added to the group but
 * missed their point). Logs ids, the step, and TidyHQ's status and message
 * (TidyErrors are written by our clients and never carry tokens); never the
 * session.
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
    tidyStatus: failure.cause.status,
    message: failure.cause.message,
  });
}
