import { isInGroup } from "../checkin/checkIn";
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
 * Events from the last `RECENT_EVENTS_DAYS` that the member is in the
 * attendance group for, newest first, at most 5. Events with no group are
 * skipped. A failed group read throws, so the caller can show an error for
 * this section alone.
 */
export async function getRecentEvents(
  client: TidyClient,
  { contactId, now }: { contactId: string; now: Date },
): Promise<RecentEvent[]> {
  const events = await client.listEvents({
    after: new Date(now.getTime() - RECENT_EVENTS_DAYS * DAY_MS),
    before: now,
  });
  const attended = await Promise.all(
    events.map(async (event) => {
      const groupId = findEventGroup(event);
      if (!groupId || !event.start_at) return null;
      const inGroup = await isInGroup(client, groupId, contactId);
      return inGroup
        ? { id: event.id, name: event.name, startAt: event.start_at }
        : null;
    }),
  );
  return attended
    .filter((e): e is RecentEvent => e !== null)
    .sort((a, b) => b.startAt.localeCompare(a.startAt))
    .slice(0, MAX_RECENT_EVENTS);
}
