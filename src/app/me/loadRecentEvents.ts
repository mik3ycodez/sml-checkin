import { getRecentEvents, type RecentEvent } from "@/lib/member/recentEvents";
import type { TidyClient } from "@/lib/tidyhq/client";

/**
 * The member's recent events, or null if TidyHQ couldn't be read. The page
 * shows "Couldn't load recent events" for that section only, so the rest of
 * `/me` (which the member came for) still renders.
 */
export async function loadRecentEvents(
  client: TidyClient,
  args: { contactId: string; now: Date },
): Promise<RecentEvent[] | null> {
  try {
    return await getRecentEvents(client, args);
  } catch (error) {
    // Name and message only: never the error object, in case it carries a
    // request with a token.
    console.error(
      "Couldn't load recent events:",
      error instanceof Error ? `${error.name}: ${error.message}` : "unknown",
    );
    return null;
  }
}
