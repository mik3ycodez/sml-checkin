import { calculatePointsTotal } from "../points";
import type { TidyClient } from "../tidyhq/client";
import { TidyError } from "../tidyhq/errors";
import { resolveEventGroup } from "../tidyhq/eventGroups";

/** Attendance group for an event, or null if it has none. */
function groupOrNull(eventId: string): string | null {
  try {
    return resolveEventGroup({ id: eventId });
  } catch (error) {
    if (error instanceof TidyError && error.status === 404) return null;
    throw error;
  }
}

/**
 * A member's points total, rebuilt from every event attendance group they're
 * in. Never reads or writes the stored points field, so callers can compare
 * and write it themselves, and retries can never double-count.
 */
export async function recalculatePoints(
  client: TidyClient,
  contactId: string,
): Promise<number> {
  const events = await client.listEvents();
  const attended = await Promise.all(
    events.map(async (event) => {
      const groupId = groupOrNull(event.id);
      if (!groupId) return null;
      const contacts = await client.listGroupContacts(groupId);
      return contacts.some((c) => c.id === contactId) ? event.id : null;
    }),
  );
  // Roles aren't saved yet, so every past check-in counts as an attendee.
  return calculatePointsTotal(
    attended
      .filter((eventId) => eventId !== null)
      .map((eventId) => ({ eventId, role: "attendee" as const })),
  );
}
