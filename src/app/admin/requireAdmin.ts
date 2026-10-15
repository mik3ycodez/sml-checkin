import { redirect } from "next/navigation";
import { adminAccess, adminGroupId } from "@/lib/auth/admin";
import { getSession } from "@/lib/auth/session";
import { getTidyClient, getTidyMode } from "@/lib/tidyhq";
import { signInPath } from "../memberPaths";

export type AdminCheck =
  | { status: "admin"; contactId: string; name: string }
  | {
      status: "denied";
      reason: "not_admin" | "unavailable";
      /** Null if TidyHQ couldn't say who this is. */
      name: string | null;
    };

/**
 * The guard for every admin page and server action: call it first, and only
 * go on when `status` is `admin`. A page check alone doesn't protect a server
 * action, which anyone can post to, so each action calls this itself.
 *
 * No session redirects to sign-in and back to `returnTo`. Anyone else not in
 * the App Admin group, or any trouble reading it, is `denied` (fails closed),
 * and the page renders `AdminDeniedScreen`. It's a result and not Next's
 * `forbidden()`, which is experimental and can't say which of the two it was.
 */
export async function requireAdmin(returnTo: string): Promise<AdminCheck> {
  const session = await getSession();
  if (!session) redirect(signInPath(returnTo));

  const client = getTidyClient();
  const { contactId } = session;
  const access = await adminAccess(
    client,
    contactId,
    adminGroupId({ ADMIN_GROUP_ID: process.env.ADMIN_GROUP_ID }, getTidyMode()),
  );
  if (access.status === "admin") {
    return { status: "admin", contactId, name: access.name };
  }
  // Only to say who's signed in. If this read fails too, the screen still
  // offers a sign-out.
  const name = await client
    .getContact(contactId)
    .then((contact) => contact.display_name)
    .catch(() => null);
  return { status: "denied", reason: access.status, name };
}
