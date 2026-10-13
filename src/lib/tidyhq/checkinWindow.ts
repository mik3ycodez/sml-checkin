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

/** Both times parsed, with close after open; otherwise null. */
function validRange(
  opens: string | null,
  closes: string | null,
): { opensAt: Date; closesAt: Date } | null {
  const opensAt = parseTime(opens);
  const closesAt = parseTime(closes);
  if (!opensAt || !closesAt || closesAt <= opensAt) return null;
  return { opensAt, closesAt };
}

/**
 * The only place that works out when check-in is open for an event. Uses the
 * admin-set window if it's valid, otherwise the event's start to end. A
 * half-filled, unparseable, or backwards window counts as not set, so a typo
 * in TidyHQ doesn't lock members out. If the event's own dates are invalid
 * too, both times are null and check-in is closed. A cache can go here later.
 */
export async function getCheckinWindow(
  client: TidyClient,
  event: Pick<Event, "id" | "start_at" | "end_at">,
): Promise<CheckinWindow> {
  const window = await client.getEventCheckinWindow(event.id);
  const adminSet = window && validRange(window.opens_at, window.closes_at);
  if (adminSet) return { ...adminSet, source: "event" };
  const fromEvent = validRange(event.start_at, event.end_at);
  return { opensAt: null, closesAt: null, ...fromEvent, source: "fallback" };
}

/**
 * Open from `opensAt` (inclusive) until `closesAt` (exclusive). Closed if
 * either is missing or the window is backwards.
 */
export function isCheckinOpen(window: CheckinWindow, now: Date): CheckinStatus {
  const { opensAt, closesAt } = window;
  if (!opensAt || !closesAt || closesAt <= opensAt) return "closed";
  if (now < opensAt) return "not_yet";
  if (now >= closesAt) return "closed";
  return "open";
}
