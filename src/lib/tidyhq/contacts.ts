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
