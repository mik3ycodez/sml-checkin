// How the app reads TidyHQ times. Shared so the check-in window, the admin
// event list, and recent events agree on what counts as a readable time and a
// valid range.

import { isCalendarDate } from "../dates";

// ISO 8601 date and time with an explicit offset: `Z` or `+hh:mm` / `+hhmm`.
// Anything looser is refused rather than guessed at: the engine's own parser
// reads "Oct 17 18:30" as the year 2001 and a time with no offset as the
// server's clock, so a typo in a TidyHQ field would pass as a real time.
const ISO_WITH_OFFSET =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/;

/**
 * A timestamp as a Date, or null if it's missing, blank, or isn't ISO 8601
 * with an explicit offset or Z (spaces around it are ignored).
 */
export function parseTime(value: string | null): Date | null {
  const text = value?.trim();
  if (!text || !ISO_WITH_OFFSET.test(text)) return null;
  // The engine rolls "02-30" over to March 2nd; a date that doesn't exist is
  // a typo, not a time.
  if (!isCalendarDate(text.slice(0, 10))) return null;
  const date = new Date(text);
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
  // Spaces alone count as blank: a cleared field that kept a space is unset.
  const given = [opens, closes].map((time) => time?.trim() ?? "");
  if (!given[0] && !given[1]) return "not_set";
  if (!given[0] || !given[1]) return "half_filled";
  const opensAt = parseTime(given[0]);
  const closesAt = parseTime(given[1]);
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
