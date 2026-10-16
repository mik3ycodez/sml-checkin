// How the app reads TidyHQ times. Shared so the check-in window, the admin
// event list, and recent events agree on what counts as a readable time and a
// valid range.

/** A timestamp as a Date, or null if it's missing, empty, or unreadable. */
export function parseTime(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Both times parsed, with close after open; otherwise null. */
export function validRange(
  opens: string | null,
  closes: string | null,
): { opensAt: Date; closesAt: Date } | null {
  const opensAt = parseTime(opens);
  const closesAt = parseTime(closes);
  if (!opensAt || !closesAt || closesAt <= opensAt) return null;
  return { opensAt, closesAt };
}
