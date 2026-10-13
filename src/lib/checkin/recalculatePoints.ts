import { calculatePointsTotal } from "../points";
import type { TidyClient } from "../tidyhq/client";
import { TidyError } from "../tidyhq/errors";
import { listAttendanceGroups } from "../tidyhq/eventGroups";

/** Contact ids in a group, or none if the group no longer exists. */
async function groupMemberIds(
  client: TidyClient,
  groupId: string,
): Promise<string[]> {
  try {
    return (await client.listGroupContacts(groupId)).map((c) => c.id);
  } catch (error) {
    if (error instanceof TidyError && error.status === 404) return [];
    throw error;
  }
}

/**
 * A member's points total, rebuilt from every event attendance group they're
 * in. A group deleted in TidyHQ counts as empty. Never reads or writes the
 * stored points field, so callers can compare and write it themselves, and
 * retries can never double-count.
 */
export async function recalculatePoints(
  client: TidyClient,
  contactId: string,
): Promise<number> {
  const attended = await Promise.all(
    listAttendanceGroups().map(async ({ eventId, groupId }) =>
      (await groupMemberIds(client, groupId)).includes(contactId)
        ? eventId
        : null,
    ),
  );
  // Roles aren't saved yet, so every past check-in counts as an attendee.
  return calculatePointsTotal(
    attended
      .filter((eventId) => eventId !== null)
      .map((eventId) => ({ eventId, role: "attendee" as const })),
  );
}
