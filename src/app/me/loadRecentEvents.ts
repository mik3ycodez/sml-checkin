import { loadOrNull } from "@/app/loadOrNull";
import { getRecentEvents, type RecentEvent } from "@/lib/member/recentEvents";
import type { TidyClient } from "@/lib/tidyhq/client";

/**
 * The member's recent events, or null if TidyHQ couldn't be read. The page
 * shows "Couldn't load recent events" for that section only, so the rest of
 * `/me` (which the member came for) still renders.
 */
export function loadRecentEvents(
  client: TidyClient,
  args: { contactId: string; now: Date },
): Promise<RecentEvent[] | null> {
  return loadOrNull("Couldn't load recent events", () =>
    getRecentEvents(client, args),
  );
}
