import { redirect } from "next/navigation";
import { adminAccess, adminGroup } from "@/lib/auth/admin";
import { getSession } from "@/lib/auth/session";
import { getTidyClient, getTidyMode } from "@/lib/tidyhq";
import { signInPath } from "../memberPaths";
import { lookupContact } from "./lookupContact";
import { adminDeniedPath } from "./paths";

/**
 * The guard for every admin page and server action: call it first. It fails
 * closed by stopping the request itself, so a caller can't forget to check
 * the result (a page check alone doesn't protect a server action, which
 * anyone can post to). It only ever returns for an admin.
 *
 * - No session, or a session whose contact TidyHQ no longer has: redirects to
 *   sign-in and back to `returnTo`, as `/me` does.
 * - Not in the App Admin group, or any trouble reading it: redirects to the
 *   denied page, which says which of the two it was. When access couldn't be
 *   checked from an event page, it also says which page, so the denied screen
 *   can retry it. (A redirect, not Next's
 *   `forbidden()`, which is experimental and can't say.)
 *
 * The group and the contact are read together, since neither needs the other.
 */
export async function requireAdmin(
  returnTo: string,
): Promise<{ contactId: string; name: string }> {
  const session = await getSession();
  if (!session) redirect(signInPath(returnTo));

  const client = getTidyClient();
  const { contactId } = session;
  const [access, contact] = await Promise.all([
    adminAccess(
      client,
      contactId,
      adminGroup({ ADMIN_GROUP_ID: process.env.ADMIN_GROUP_ID }, getTidyMode()),
    ),
    lookupContact(client, contactId),
  ]);
  if (contact.status === "unknown") redirect(signInPath(returnTo));
  if (access.status !== "admin")
    redirect(adminDeniedPath(access.status, returnTo));
  return { contactId, name: access.name };
}
