import type { TidyClient, TidyMode } from "../tidyhq";
import { contactName } from "../tidyhq/contactName";
import { isTidyError } from "../tidyhq/errors";
import { MOCK_ADMIN_GROUP_ID } from "../tidyhq/mock/seed";

// Who may use the admin pages: contacts in SML's "App Admin" group in TidyHQ,
// which the Board manages there. Nothing about admin status is stored in the
// session, and the group is read on every admin request, so a removal takes
// effect on the person's next page load.

/** A TidyHQ group id: letters, digits, `_` and `-`, so it can't alter a URL path. */
const GROUP_ID = /^[A-Za-z0-9_-]+$/;

/**
 * The App Admin group's id from `ADMIN_GROUP_ID`, or why there isn't a usable
 * one: `not_configured` (unset or blank) or `invalid` (set, but not a group
 * id), so the log points at the real problem. Mock mode falls back to the
 * seed's group when it's unset, so development needs no setup; live mode has
 * no default.
 */
export type AdminGroup =
  { id: string } | { problem: "not_configured" | "invalid" };

/**
 * Reads a group id setting: the trimmed value if it's a usable id, else why
 * not. `mockDefault` stands in only for an unset or blank value in mock mode.
 * Shared by the admin and volunteer groups so the two can't drift apart.
 */
export function groupFromSetting(
  value: string | undefined,
  mockDefault: string,
  mode: TidyMode,
): AdminGroup {
  const configured = value?.trim();
  if (!configured) {
    return mode === "mock"
      ? { id: mockDefault }
      : { problem: "not_configured" };
  }
  return GROUP_ID.test(configured)
    ? { id: configured }
    : { problem: "invalid" };
}

export function adminGroup(
  env: { ADMIN_GROUP_ID?: string },
  mode: TidyMode,
): AdminGroup {
  return groupFromSetting(env.ADMIN_GROUP_ID, MOCK_ADMIN_GROUP_ID, mode);
}

export type AdminAccess =
  | { status: "admin"; name: string }
  | { status: "not_admin" }
  /** The group couldn't be read. Denied, which is different from `not_admin`. */
  | { status: "unavailable" };

/** Why an admin page turned someone away; derived, so a new status can't drift. */
export type AdminDeniedReason = Exclude<AdminAccess["status"], "admin">;

/**
 * Whether the contact is an admin. Fails closed: if the group can't be read
 * (TidyHQ error, unknown group, no usable id), nobody is let in, and the
 * reason is logged. Logs the contact id and TidyHQ's status and message
 * (TidyErrors never carry tokens); for any other error, only its name.
 */
export async function adminAccess(
  client: TidyClient,
  contactId: string,
  group: AdminGroup,
): Promise<AdminAccess> {
  if ("problem" in group) {
    console.error("admin access unavailable", {
      contactId,
      reason: group.problem,
    });
    return { status: "unavailable" };
  }
  try {
    const admins = await client.listGroupContacts(group.id);
    const admin = admins.find((c) => c.id === contactId);
    return admin
      ? { status: "admin", name: contactName(admin) }
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
