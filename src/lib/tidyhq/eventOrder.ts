import { parseTime } from "./timeRange";
import type { Event } from "./types";

/**
 * Events by the moment each starts, earliest first. Compares parsed times,
 * not the text: TidyHQ may write offsets (`-07:00`, `-08:00` across daylight
 * saving), and the same instant sorts differently as text. An event with no
 * readable start goes last, in the order given. Both clients use this, so
 * they cannot disagree.
 */
export function sortEventsByStart(events: Event[]): Event[] {
  const starts = new Map(events.map((e) => [e, parseTime(e.start_at)]));
  return [...events].sort((a, b) => {
    const x = starts.get(a)?.getTime();
    const y = starts.get(b)?.getTime();
    if (x === undefined && y === undefined) return 0;
    if (x === undefined) return 1;
    if (y === undefined) return -1;
    return x - y;
  });
}
