// The one place point values live. Rules may expand later (e.g. volunteers
// earning more), so change them here rather than at call sites.

export type CheckInRole = "attendee" | "volunteer";
export type CheckInMethod = "self" | "staff";

export const POINTS_PER_CHECKIN: Readonly<Record<CheckInRole, number>> =
  Object.freeze({
    attendee: 1,
    volunteer: 1,
  });

/**
 * Points total from a member's full attendance history. Points never reset,
 * so pass every event they have ever attended, not just recent ones. Each
 * event counts once, so duplicate entries can never double-count.
 */
export function calculatePointsTotal(
  attendance: ReadonlyArray<{ eventId: string; role: CheckInRole }>,
): number {
  const roleByEvent = new Map(attendance.map((a) => [a.eventId, a.role]));
  let total = 0;
  for (const role of roleByEvent.values()) total += POINTS_PER_CHECKIN[role];
  return total;
}
