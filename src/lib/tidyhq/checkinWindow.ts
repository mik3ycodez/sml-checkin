import type { TidyClient } from "./client";
import { acceptsCheckIn } from "./acceptsCheckIn";
import { findEventGroup } from "./eventGroups";
import { rangeProblem, validRange, type RangeProblem } from "./timeRange";
import type { Event, EventCheckinWindow } from "./types";

export interface CheckinWindow {
  /** Null when no open time is known; check-in is then closed. */
  opensAt: Date | null;
  /** Null when no close time is known; check-in is then closed. */
  closesAt: Date | null;
  /** `event`: admin-set window. `fallback`: the event's start and end. */
  source: "event" | "fallback";
}

export type CheckinStatus = "open" | "not_yet" | "closed";

/** Why an admin-set window was ignored (not set at all isn't a problem). */
export type IgnoredWindowReason = Exclude<RangeProblem, "not_set">;

export interface CheckinWindowDetails {
  window: CheckinWindow;
  /** Set when the event has a window that was ignored, and why. */
  ignored: IgnoredWindowReason | null;
}

/**
 * The only place that works out when check-in is open for an event, and why
 * an admin-set window was ignored (for the admin pages to warn about). Uses
 * the admin-set window if it's valid, otherwise the event's start to end. A
 * half-filled, unparseable, or backwards window counts as not set, so a typo
 * in TidyHQ doesn't lock members out. If the event's own dates are invalid
 * too, both times are null and check-in is closed. A cache can go here later.
 */
export async function getCheckinWindowDetails(
  client: TidyClient,
  event: Pick<Event, "id" | "start_at" | "end_at">,
): Promise<CheckinWindowDetails> {
  return resolveCheckinWindow(
    await client.getEventCheckinWindow(event.id),
    event,
  );
}

/**
 * `getCheckinWindowDetails` for a caller that has already read the admin-set
 * window (so it can read that and the event together). Pure: the rule itself.
 */
export function resolveCheckinWindow(
  set: EventCheckinWindow | null,
  event: Pick<Event, "start_at" | "end_at">,
): CheckinWindowDetails {
  const adminSet = set && validRange(set.opens_at, set.closes_at);
  if (adminSet) {
    return { window: { ...adminSet, source: "event" }, ignored: null };
  }
  const problem = set && rangeProblem(set.opens_at, set.closes_at);
  const fromEvent = validRange(event.start_at, event.end_at);
  return {
    window: { opensAt: null, closesAt: null, ...fromEvent, source: "fallback" },
    ignored: problem && problem !== "not_set" ? problem : null,
  };
}

/** The check-in window for an event; see `getCheckinWindowDetails`. */
export async function getCheckinWindow(
  client: TidyClient,
  event: Pick<Event, "id" | "start_at" | "end_at">,
): Promise<CheckinWindow> {
  return (await getCheckinWindowDetails(client, event)).window;
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

/** Why members can never check in to an event, whatever the time. */
export type CheckinBlocker =
  /** Archived in TidyHQ: not an event to run check-in for. */
  | "archived"
  /** The event fails `acceptsCheckIn`: it takes no check-ins at all. */
  | "not_accepted"
  /** No attendance group, so a check-in couldn't be recorded. */
  | "no_group"
  /** Neither an admin window nor the event's own times can open check-in. */
  | "never_opens";

/**
 * The one rule for events members can't check in to at any time, first match
 * winning, or null. Matches what check-in itself refuses: archived
 * (`assessCheckIn`), no group (`findEvent`), a window that can't open
 * (`isCheckinOpen` is always "closed" without times). The admin event page's
 * QR code and the volunteer staff page both use it, so they can't disagree.
 */
export function checkinBlocker(
  event: Pick<Event, "id" | "archived" | "attendance_group_id">,
  window: CheckinWindow,
): CheckinBlocker | null {
  if (event.archived) return "archived";
  if (!acceptsCheckIn(event)) return "not_accepted";
  if (findEventGroup(event) === null) return "no_group";
  if (!window.opensAt || !window.closesAt) return "never_opens";
  return null;
}
