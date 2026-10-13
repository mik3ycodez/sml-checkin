// The one place point values live. Rules may expand later (e.g. volunteers
// earning more), so change them here rather than at call sites.

export type CheckInRole = "attendee" | "volunteer";
export type CheckInMethod = "self" | "staff";

export const POINTS_PER_CHECKIN: Record<CheckInRole, number> = {
  attendee: 1,
  volunteer: 1,
};

/**
 * Points total from a member's full attendance history. Points never reset,
 * so pass every event they have ever attended, not just recent ones.
 */
export function calculatePointsTotal(
  attendance: ReadonlyArray<{ role: CheckInRole }>,
): number {
  return attendance.reduce((total, a) => total + POINTS_PER_CHECKIN[a.role], 0);
}
