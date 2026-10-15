import type { TidyClient } from "../tidyhq/client";
import { findEventGroup } from "../tidyhq/eventGroups";

/** How far back `/me` looks for attended events. */
export const RECENT_EVENTS_DAYS = 90;
const MAX_RECENT_EVENTS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface RecentEvent {
  id: string;
  name: string | null;
  /** ISO timestamp. */
  startAt: string;
}

/**
 * Events from the last `RECENT_EVENTS_DAYS` that the member attended, newest
 * first, at most 5. Two requests: the recent events, and every group the
 * member is in (archived ones too, since past events' groups are archived).
 * An event counts if its attendance group is one of the member's, so
 * non-event groups (Members, Volunteers) can't appear, and events with no
 * group are skipped. A failed read throws, so the caller can show an error
 * for this section alone.
 */
export async function getRecentEvents(
  client: TidyClient,
  { contactId, now }: { contactId: string; now: Date },
): Promise<RecentEvent[]> {
  const [events, groups] = await Promise.all([
    client.listEvents({
      after: new Date(now.getTime() - RECENT_EVENTS_DAYS * DAY_MS),
      before: now,
    }),
    client.listContactGroups(contactId),
  ]);
  const memberGroupIds = new Set(groups.map((g) => g.id));
  const attended: RecentEvent[] = [];
  for (const event of events) {
    const groupId = findEventGroup(event);
    if (!groupId || !event.start_at || !memberGroupIds.has(groupId)) continue;
    attended.push({ id: event.id, name: event.name, startAt: event.start_at });
  }
  return attended
    .sort((a, b) => b.startAt.localeCompare(a.startAt))
    .slice(0, MAX_RECENT_EVENTS);
}
