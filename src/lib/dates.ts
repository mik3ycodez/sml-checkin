/** SML's time zone; membership dates are Seattle calendar dates. */
export const SML_TIME_ZONE = "America/Los_Angeles";

const seattleDateParts = new Intl.DateTimeFormat("en-US", {
  timeZone: SML_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** `YYYY-MM-DD` for `date` in Seattle, built from parts so locale data can't change the format. */
export function seattleDate(date: Date): string {
  const parts = seattleDateParts.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/**
 * `YYYY-MM-DD` moved by whole calendar days. Done in UTC, which has no DST,
 * so the result never slips a day the way adding 24-hour blocks can.
 */
export function addDays(date: string, days: number): string {
  assertCalendarDate(date);
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The moment a Seattle calendar day begins (midnight), for turning a
 * `YYYY-MM-DD` date into a time bound. Seattle's clocks change at 2am, never
 * at midnight, so the offset is always -7 or -8 hours.
 */
export function seattleStartOfDay(date: string): Date {
  assertCalendarDate(date);
  for (const offsetHours of [7, 8]) {
    const candidate = new Date(`${date}T0${offsetHours}:00:00Z`);
    const justBefore = new Date(candidate.getTime() - 1);
    if (seattleDate(candidate) === date && seattleDate(justBefore) !== date) {
      return candidate;
    }
  }
  throw new Error(`No Seattle midnight found for ${date}`);
}

const seattleTimeParts = new Intl.DateTimeFormat("en-US", {
  timeZone: SML_TIME_ZONE,
  weekday: "long",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/**
 * A moment as members read it, in Seattle time: "Saturday, October 17 at
 * 7:00 PM". Built from parts, like `seattleDate`, because how locale data
 * joins them (" at ", ", ", narrow spaces) varies between Node versions.
 */
export function seattleTimeLabel(date: Date): string {
  const parts = seattleTimeParts.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)!.value;
  return `${part("weekday")}, ${part("month")} ${part("day")} at ${part("hour")}:${part("minute")} ${part("dayPeriod")}`;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * A `YYYY-MM-DD` calendar date as members read it: "September 22, 2026".
 * Pure string work, with no time zone or locale data involved.
 */
export function dateLabel(date: string): string {
  assertCalendarDate(date);
  const [year, month, day] = date.split("-").map(Number);
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

/** True for a real `YYYY-MM-DD` date (rejects "2026-13-45" and timestamps). */
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function assertCalendarDate(value: string): void {
  if (!isCalendarDate(value)) {
    throw new Error(`Not a YYYY-MM-DD date: ${JSON.stringify(value)}`);
  }
}

/**
 * A date from TidyHQ as `YYYY-MM-DD`: a plain date as is, a timestamp cut to
 * its date part (as written, not shifted between time zones), anything else
 * (or null) as null. Used where TidyHQ's dates come in, so a format surprise
 * can't throw in the middle of a check-in.
 */
export function calendarDate(value: string | null): string | null {
  if (value === null) return null;
  const day = value.slice(0, 10);
  const rest = value.slice(10);
  if (rest !== "" && !rest.startsWith("T")) return null;
  return isCalendarDate(day) ? day : null;
}
