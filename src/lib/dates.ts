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
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
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
