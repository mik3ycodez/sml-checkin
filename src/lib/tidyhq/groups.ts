import type { TidyClient } from "./client";

/**
 * Whether the contact is in the group. The one place that decides "already
 * checked in".
 */
export async function isInGroup(
  client: TidyClient,
  groupId: string,
  contactId: string,
): Promise<boolean> {
  const attendees = await client.listGroupContacts(groupId);
  return attendees.some((c) => c.id === contactId);
}
