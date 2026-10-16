import { addDays, seattleDate, seattleStartOfDay } from "../dates";
import type { TidyClient } from "../tidyhq/client";
import { findEventGroup } from "../tidyhq/eventGroups";

/** How far back the admin event list looks for recent events. */
export const ADMIN_RECENT_DAYS = 30;

export interface AdminEvent {
  id: string;
  name: string | null;
  /** ISO timestamp. */
  startAt: string;
  location: string | null;
  /** False if the event has no attendance group, so check-in can't work. */
  hasGroup: boolean;
}

export interface AdminEvents {
  /** Not yet ended (so including one in progress), soonest first. */
  upcoming: AdminEvent[];
  /** Ended within `ADMIN_RECENT_DAYS`, newest first. */
  recent: AdminEvent[];
}

/**
 * The events for the admin home page, from one `listEvents` read. "Recent"
 * runs from the start of the Seattle day `ADMIN_RECENT_DAYS` ago. Events
 * whose start or end can't be read are left out (we can't place them, and
 * formatting them would crash the page). A failed read throws, so the page
 * can say so.
 */
export async function getAdminEvents(
  client: TidyClient,
  { now }: { now: Date },
): Promise<AdminEvents> {
  const since = seattleStartOfDay(
    addDays(seattleDate(now), -ADMIN_RECENT_DAYS),
  );
  const events = await client.listEvents({ after: since });
  const upcoming: AdminEvent[] = [];
  const recent: AdminEvent[] = [];
  for (const e of events) {
    if (!e.start_at || !e.end_at) continue;
    const start = Date.parse(e.start_at);
    const end = Date.parse(e.end_at);
    if (Number.isNaN(start) || Number.isNaN(end)) continue;
    const item: AdminEvent = {
      id: e.id,
      name: e.name,
      startAt: e.start_at,
      location: e.location,
      hasGroup: findEventGroup(e) !== null,
    };
    (end > now.getTime() ? upcoming : recent).push(item);
  }
  const byStart = (a: AdminEvent, b: AdminEvent) =>
    Date.parse(a.startAt) - Date.parse(b.startAt);
  return {
    upcoming: upcoming.sort(byStart),
    recent: recent.sort((a, b) => byStart(b, a)),
  };
}
