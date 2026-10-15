import type { TidyClient, TidyMode } from "../tidyhq";
import { isTidyError } from "../tidyhq/errors";
import { MOCK_ADMIN_GROUP_ID } from "../tidyhq/mock/seed";

// Who may use the admin pages: contacts in SML's "App Admin" group in TidyHQ,
// which the Board manages there. Nothing about admin status is stored in the
// session, and the group is read on every admin request, so a removal takes
// effect on the person's next page load.

/** A TidyHQ group id: letters, digits, `_` and `-`, so it can't alter a URL path. */
const GROUP_ID = /^[A-Za-z0-9_-]+$/;

/**
 * The App Admin group's id, from `ADMIN_GROUP_ID`, or null if there isn't a
 * usable one. Mock mode falls back to the seed's group so development needs
 * no setup; live mode has no default.
 */
export function adminGroupId(
  env: { ADMIN_GROUP_ID?: string },
  mode: TidyMode,
): string | null {
  const configured = env.ADMIN_GROUP_ID?.trim();
  if (!configured) return mode === "mock" ? MOCK_ADMIN_GROUP_ID : null;
  return GROUP_ID.test(configured) ? configured : null;
}

export type AdminAccess =
  | { status: "admin"; name: string }
  | { status: "not_admin" }
  /** The group couldn't be read. Denied, which is different from `not_admin`. */
  | { status: "unavailable" };

/**
 * Whether the contact is an admin. Fails closed: if the group can't be read
 * (TidyHQ error, unknown group, no usable id), nobody is let in, and the
 * reason is logged. Logs the contact id and TidyHQ's status and message
 * (TidyErrors never carry tokens); for any other error, only its name.
 */
export async function adminAccess(
  client: TidyClient,
  contactId: string,
  groupId: string | null,
): Promise<AdminAccess> {
  if (!groupId) {
    console.error("admin access unavailable", {
      contactId,
      reason: "not_configured",
    });
    return { status: "unavailable" };
  }
  try {
    const admins = await client.listGroupContacts(groupId);
    const admin = admins.find((c) => c.id === contactId);
    return admin
      ? { status: "admin", name: admin.display_name }
      : { status: "not_admin" };
  } catch (error) {
    console.error("admin access unavailable", {
      contactId,
      reason: "read_failed",
      ...(isTidyError(error)
        ? { tidyStatus: error.status, message: error.message }
        : { errorName: error instanceof Error ? error.name : "unknown" }),
    });
    return { status: "unavailable" };
  }
}
