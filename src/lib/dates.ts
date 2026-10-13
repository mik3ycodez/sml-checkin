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
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    seattleDateParts.formatToParts(date).find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
