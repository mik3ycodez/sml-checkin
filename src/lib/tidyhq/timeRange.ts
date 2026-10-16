// How the app reads TidyHQ times. Shared so the check-in window, the admin
// event list, and recent events agree on what counts as a readable time and a
// valid range.

/** A timestamp as a Date, or null if it's missing, empty, or unreadable. */
export function parseTime(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Why a pair of times isn't a usable range. `not_set`: both missing or blank,
 * so there's nothing to be wrong. `half_filled`: only one is given.
 * `unparseable`: one can't be read. `backwards`: the second isn't after the
 * first.
 */
export type RangeProblem =
  "not_set" | "half_filled" | "unparseable" | "backwards";

/**
 * Why `validRange` would reject these times, or null if it wouldn't. The one
 * place that decides, so the admin pages' warnings and check-in's behavior
 * can't disagree (`validRange` is this rule's yes/no).
 */
export function rangeProblem(
  opens: string | null,
  closes: string | null,
): RangeProblem | null {
  if (!opens && !closes) return "not_set";
  if (!opens || !closes) return "half_filled";
  const opensAt = parseTime(opens);
  const closesAt = parseTime(closes);
  if (!opensAt || !closesAt) return "unparseable";
  return closesAt <= opensAt ? "backwards" : null;
}

/** Both times parsed, with close after open; otherwise null. */
export function validRange(
  opens: string | null,
  closes: string | null,
): { opensAt: Date; closesAt: Date } | null {
  if (rangeProblem(opens, closes) !== null) return null;
  return { opensAt: parseTime(opens)!, closesAt: parseTime(closes)! };
}
