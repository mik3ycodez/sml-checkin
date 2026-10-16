import { redirect } from "next/navigation";
import { type AdminDeniedReason, adminGroup } from "@/lib/auth/admin";
import { getSession } from "@/lib/auth/session";
import {
  helperGroup,
  type VolunteerDeniedReason,
  volunteerAccess,
} from "@/lib/auth/volunteer";
import { getTidyClient, getTidyMode } from "@/lib/tidyhq";
import { adminDeniedPath } from "./admin/paths";
import { lookupContact } from "./admin/lookupContact";
import { signInPath } from "./memberPaths";

// The denied screen's reason picks wording only. Typed against every denial
// the access check can give, so a new one can't be left unmapped.
const DENIED_AS: Record<VolunteerDeniedReason, AdminDeniedReason> = {
  not_volunteer: "not_admin",
  unavailable: "unavailable",
};

/**
 * The guard for every volunteer page and server action: call it first. Like
 * `requireAdmin`, it fails closed by stopping the request itself, so a caller
 * can't forget to check the result. It only ever returns for a volunteer
 * (App Check-In Volunteers) or an admin (App Admin), and says which, so an
 * action can record the role. It re-checks TidyHQ on every call.
 *
 * - No session, or a session whose contact TidyHQ no longer has: redirects to
 *   sign-in and back to `returnTo`.
 * - In neither group, or any trouble reading them: redirects to the denied
 *   screen, which tells "not allowed" from "couldn't check". For the staff
 *   check-in page it keeps `returnTo`, so the screen words its guidance for
 *   volunteers, links back to member check-in, and retries the page.
 */
export async function requireVolunteer(
  returnTo: string,
): Promise<{ contactId: string; name: string; role: "admin" | "volunteer" }> {
  const session = await getSession();
  if (!session) redirect(signInPath(returnTo));

  const client = getTidyClient();
  const { contactId } = session;
  const mode = getTidyMode();
  const [access, contact] = await Promise.all([
    volunteerAccess(
      client,
      contactId,
      helperGroup({ HELPER_GROUP_ID: process.env.HELPER_GROUP_ID }, mode),
      adminGroup({ ADMIN_GROUP_ID: process.env.ADMIN_GROUP_ID }, mode),
    ),
    lookupContact(client, contactId),
  ]);
  if (contact.status === "unknown") redirect(signInPath(returnTo));
  if (access.status === "admin" || access.status === "volunteer")
    return { contactId, name: access.name, role: access.status };
  redirect(adminDeniedPath(DENIED_AS[access.status], returnTo));
}
