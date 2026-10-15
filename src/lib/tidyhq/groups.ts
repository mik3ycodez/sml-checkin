import type { TidyClient } from "./client";

/**
 * Whether the contact is in the group: check-in's "already checked in" rule,
 * from the event's attendee list. `/me`'s recent events ask the other way
 * round (`listContactGroups`), so the two TidyHQ endpoints must agree; see the
 * plan's open questions.
 */
export async function isInGroup(
  client: TidyClient,
  groupId: string,
  contactId: string,
): Promise<boolean> {
  const attendees = await client.listGroupContacts(groupId);
  return attendees.some((c) => c.id === contactId);
}
