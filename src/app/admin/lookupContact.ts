import type { TidyClient } from "@/lib/tidyhq";
import { contactName } from "@/lib/tidyhq/contactName";
import { isTidyError } from "@/lib/tidyhq/errors";

/**
 * Who a signed-in session is, for the admin pages: their name, `unknown` if
 * TidyHQ no longer has the contact (a stale session, so sign in again, as
 * `/me` does), or `unreadable` if the read failed for any other reason, which
 * the admin pages tolerate.
 */
export async function lookupContact(
  client: TidyClient,
  contactId: string,
): Promise<
  { status: "known"; name: string } | { status: "unknown" | "unreadable" }
> {
  try {
    const contact = await client.getContact(contactId);
    return { status: "known", name: contactName(contact) };
  } catch (error) {
    return { status: isTidyError(error, 404) ? "unknown" : "unreadable" };
  }
}
