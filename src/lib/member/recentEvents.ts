import { seattleDaysAgo, seattleDaysFromNow } from "../dates";
import type { TidyClient } from "../tidyhq/client";
import { findEventGroup } from "../tidyhq/eventGroups";
import { parseTime } from "../tidyhq/timeRange";

/** How far back `/me` looks for attended events. */
export const RECENT_EVENTS_DAYS = 90;
const MAX_RECENT_EVENTS = 5;

export interface RecentEvent {
  id: string;
  name: string | null;
  /** ISO timestamp. */
  startAt: string;
}

/**
 * Events from the last `RECENT_EVENTS_DAYS` that the member attended, newest
 * first, at most 5. "Last 90 days" and "today" are Seattle calendar days:
 * the window runs from the start of the day 90 days ago to the end of today,
 * so a member who checked in before the event's start (the admin window can
 * open early) sees it straight away, while later days' events never appear.
 * Two requests: the recent events, and every group the
 * member is in (archived ones too, since past events' groups are archived).
 * An event counts if its attendance group is one of the member's, so
 * non-event groups (Members, Volunteers) can't appear, and events with no
 * group or no readable start time are skipped. A failed read throws, so the caller can show an error
 * for this section alone.
 */
export async function getRecentEvents(
  client: TidyClient,
  { contactId, now }: { contactId: string; now: Date },
): Promise<RecentEvent[]> {
  const [events, groups] = await Promise.all([
    client.listEvents({
      after: seattleDaysAgo(now, RECENT_EVENTS_DAYS),
      before: seattleDaysFromNow(now, 1),
    }),
    client.listContactGroups(contactId),
  ]);
  const memberGroupIds = new Set(groups.map((g) => g.id));
  const attended: RecentEvent[] = [];
  for (const event of events) {
    const groupId = findEventGroup(event);
    if (!groupId || !memberGroupIds.has(groupId)) continue;
    // A start time we can't read would crash the page's date formatting.
    const start = parseTime(event.start_at);
    if (!start) continue;
    attended.push({ id: event.id, name: event.name, startAt: event.start_at! });
  }
  return attended
    .sort((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt))
    .slice(0, MAX_RECENT_EVENTS);
}
