// The one place point values live. Rules may expand later (e.g. volunteers
// earning more), so change them here rather than at call sites.

export type CheckInRole = "attendee" | "volunteer";
export type CheckInMethod = "self" | "staff";

export const POINTS_PER_CHECKIN: Readonly<Record<CheckInRole, number>> =
  Object.freeze({
    attendee: 1,
    volunteer: 1,
  });
