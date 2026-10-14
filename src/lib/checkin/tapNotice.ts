// A short-lived note from the check-in action to the result page about what
// this tap did. The result page re-reads everything else from TidyHQ, but
// group membership alone can't tell it whether this tap awarded a point, was
// a repeat, or added the member but failed to save their point (the points
// write may fail, or staff may have added them), so without this note it
// would have to guess.
//
// Not signed: it only changes what the member's own screen says. It's never
// used to award or write points, and the total shown is always TidyHQ's.

export const TAP_NOTICE_COOKIE = "sml_tap";
/** Long enough for the redirect, short enough not to linger. */
export const TAP_NOTICE_MAX_AGE_SECONDS = 60;

/** What the last tap did, for a member who is now in the event's group. */
export type TapOutcome =
  | { kind: "awarded"; points: number }
  /** Already checked in, so no point. */
  | { kind: "repeat" }
  /** Added to the group, but the points write failed. */
  | { kind: "point_not_saved" };

type For = { eventId: string; contactId: string };

export function encodeTapNotice({
  eventId,
  contactId,
  outcome,
}: For & { outcome: TapOutcome }): string {
  const params = new URLSearchParams({
    e: eventId,
    c: contactId,
    o: outcome.kind,
  });
  if (outcome.kind === "awarded") params.set("p", String(outcome.points));
  return params.toString();
}

/**
 * What the last tap did for this member at this event, or null if the notice
 * is missing, malformed, or for someone else (a shared phone).
 */
export function readTapNotice(
  value: string | undefined,
  { eventId, contactId }: For,
): TapOutcome | null {
  if (!value) return null;
  const params = new URLSearchParams(value);
  if (params.get("e") !== eventId || params.get("c") !== contactId) return null;
  switch (params.get("o")) {
    case "awarded": {
      const points = params.get("p") ?? "";
      if (!/^[1-9]\d*$/.test(points)) return null;
      return { kind: "awarded", points: Number(points) };
    }
    case "repeat":
      return { kind: "repeat" };
    case "point_not_saved":
      return { kind: "point_not_saved" };
    default:
      return null;
  }
}
