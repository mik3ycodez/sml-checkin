// A short-lived note from the check-in action to the result page: "this tap
// just awarded N points". The result page re-reads everything else from
// TidyHQ, but group membership alone can't tell it whether a point was
// awarded (the points write may have failed, or staff added the member), so
// without this note it would have to guess.
//
// Not signed: it only changes what the member's own screen says. It's never
// used to award or write points, and the total shown is always TidyHQ's.

export const AWARD_NOTICE_COOKIE = "sml_awarded";
/** Long enough for the redirect, short enough not to linger. */
export const AWARD_NOTICE_MAX_AGE_SECONDS = 60;

type For = { eventId: string; contactId: string };

export function encodeAwardNotice({
  eventId,
  contactId,
  points,
}: For & { points: number }): string {
  return new URLSearchParams({
    e: eventId,
    c: contactId,
    p: String(points),
  }).toString();
}

/**
 * Points awarded to this member at this event by the last tap, or null if
 * the notice is missing, malformed, or for someone else (a shared phone).
 */
export function readAwardNotice(
  value: string | undefined,
  { eventId, contactId }: For,
): number | null {
  if (!value) return null;
  const params = new URLSearchParams(value);
  if (params.get("e") !== eventId || params.get("c") !== contactId) return null;
  const points = params.get("p") ?? "";
  if (!/^[1-9]\d*$/.test(points)) return null;
  return Number(points);
}
