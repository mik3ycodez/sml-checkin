import type { TidyClient } from "./client";
import { isTidyError } from "./errors";
import type { Contact } from "./types";

/** The contact, or null if TidyHQ doesn't have it (404). Other errors throw. */
export async function findContact(
  client: TidyClient,
  contactId: string,
): Promise<Contact | null> {
  try {
    return await client.getContact(contactId);
  } catch (error) {
    if (isTidyError(error, 404)) return null;
    throw error;
  }
}

/** Shortest search staff may run, so one letter can't list every member. */
export const MIN_SEARCH_LENGTH = 2;

/** Most matches staff are shown; more than this asks them to type more. */
export const MAX_SEARCH_RESULTS = 20;

export type MemberSearch =
  | { status: "ok"; contacts: Contact[] }
  | { status: "too_short" }
  | { status: "too_many" };

/**
 * Member search for staff check-in, and the only way it should call
 * `searchContacts`. The limits live here, not in a client, so they hold for
 * the mock and for any live client: a query under `MIN_SEARCH_LENGTH` never
 * reaches TidyHQ, and more than `MAX_SEARCH_RESULTS` matches returns no names.
 */
export async function searchMembers(
  client: TidyClient,
  query: string,
): Promise<MemberSearch> {
  const trimmed = query.trim();
  if (trimmed.length < MIN_SEARCH_LENGTH) return { status: "too_short" };
  const contacts = await client.searchContacts(trimmed);
  if (contacts.length > MAX_SEARCH_RESULTS) return { status: "too_many" };
  return { status: "ok", contacts };
}
