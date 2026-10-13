import type { TidyClient } from "./client";
import type { Event } from "./types";

export interface CheckinWindow {
  /** Null when no open time is known; check-in is then closed. */
  opensAt: Date | null;
  /** Null when no close time is known; check-in is then closed. */
  closesAt: Date | null;
  /** `event`: admin-set window. `fallback`: the event's start and end. */
  source: "event" | "fallback";
}

export type CheckinStatus = "open" | "not_yet" | "closed";

function parseTime(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * The only place that works out when check-in is open for an event. Uses the
 * admin-set window if there is one, otherwise the event's start to end.
 * A cache can go here later.
 */
export async function getCheckinWindow(
  client: TidyClient,
  event: Pick<Event, "id" | "start_at" | "end_at">,
): Promise<CheckinWindow> {
  const window = await client.getEventCheckinWindow(event.id);
  if (window) {
    return {
      opensAt: parseTime(window.opens_at),
      closesAt: parseTime(window.closes_at),
      source: "event",
    };
  }
  return {
    opensAt: parseTime(event.start_at),
    closesAt: parseTime(event.end_at),
    source: "fallback",
  };
}

/** Open from `opensAt` (inclusive) until `closesAt` (exclusive). */
export function isCheckinOpen(window: CheckinWindow, now: Date): CheckinStatus {
  const { opensAt, closesAt } = window;
  if (!opensAt || !closesAt) return "closed";
  if (now < opensAt) return "not_yet";
  if (now >= closesAt) return "closed";
  return "open";
}
