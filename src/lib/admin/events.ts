import { seattleDaysAgo, seattleDaysFromNow } from "../dates";
import type { TidyClient } from "../tidyhq/client";
import { findEventGroup } from "../tidyhq/eventGroups";
import { parseTime, validRange } from "../tidyhq/timeRange";

/** How far back the admin event list looks for recent events. */
export const ADMIN_RECENT_DAYS = 30;

/** How far ahead the admin event list looks for upcoming events. */
export const ADMIN_UPCOMING_DAYS = 60;

export interface AdminEvent {
  id: string;
  /** Null if TidyHQ has none (or a blank one). */
  name: string | null;
  /** ISO timestamp. */
  startAt: string;
  /** Null if TidyHQ has none (or a blank one). */
  location: string | null;
  /** False if the event has no attendance group, so check-in can't work. */
  hasGroup: boolean;
  /** Archived in TidyHQ. Listed, but with no link. */
  archived: boolean;
  /** The end isn't after the start, so the event's own times can't open check-in. */
  invalidTimes: boolean;
}

export interface AdminEvents {
  /** Not yet ended (so including one in progress), soonest first. */
  upcoming: AdminEvent[];
  /** Ended within `ADMIN_RECENT_DAYS`, newest first. */
  recent: AdminEvent[];
}

/** A name or place with nothing but spaces in it counts as missing. */
export const blankToNull = (value: string | null) => value?.trim() || null;

/**
 * The events for the admin home page, from one `listEvents` read: events
 * that ended in the last `ADMIN_RECENT_DAYS` Seattle days or start within the
 * next `ADMIN_UPCOMING_DAYS`. Events whose start or end can't be read are left
 * out (we can't place them, and formatting them would crash the page).
 * Archived events and events whose end isn't after their start are kept but
 * flagged. A failed read throws, so the caller can say so.
 */
export async function getAdminEvents(
  client: TidyClient,
  { now }: { now: Date },
): Promise<AdminEvents> {
  const events = await client.listEvents({
    after: seattleDaysAgo(now, ADMIN_RECENT_DAYS),
    before: seattleDaysFromNow(now, ADMIN_UPCOMING_DAYS + 1),
  });
  // Start times are parsed once here and kept for sorting.
  const upcoming: { start: number; item: AdminEvent }[] = [];
  const recent: { start: number; item: AdminEvent }[] = [];
  for (const e of events) {
    const start = parseTime(e.start_at);
    const end = parseTime(e.end_at);
    if (!start || !end) continue;
    const item: AdminEvent = {
      id: e.id,
      name: blankToNull(e.name),
      startAt: e.start_at!,
      location: blankToNull(e.location),
      hasGroup: findEventGroup(e) !== null,
      archived: e.archived,
      invalidTimes: validRange(e.start_at, e.end_at) === null,
    };
    (end > now ? upcoming : recent).push({ start: start.getTime(), item });
  }
  return {
    upcoming: upcoming.sort((a, b) => a.start - b.start).map((x) => x.item),
    recent: recent.sort((a, b) => b.start - a.start).map((x) => x.item),
  };
}
