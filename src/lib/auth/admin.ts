import type { TidyClient, TidyMode } from "../tidyhq";
import { contactName } from "../tidyhq/contactName";
import { MOCK_ADMIN_GROUP_ID } from "../tidyhq/mock/seed";
import {
  type GroupSetting,
  groupFromSetting,
  readGroupMembers,
} from "./groupAccess";

// Who may use the admin pages: contacts in SML's "App Admin" group in TidyHQ,
// which the Board manages there. Nothing about admin status is stored in the
// session, and the group is read on every admin request, so a removal takes
// effect on the person's next page load.

/**
 * The App Admin group's id from `ADMIN_GROUP_ID`, or why there isn't a usable
 * one. Mock mode falls back to the seed's group when it's unset; live mode
 * has no default.
 */
export function adminGroup(
  env: { ADMIN_GROUP_ID?: string },
  mode: TidyMode,
): GroupSetting {
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
  group: GroupSetting,
): Promise<AdminAccess> {
  const read = await readGroupMembers(client, group);
  if ("failure" in read) {
    console.error("admin access unavailable", {
      contactId,
      ...read.failure,
    });
    return { status: "unavailable" };
  }
  const admin = read.members.find((c) => c.id === contactId);
  return admin
    ? { status: "admin", name: contactName(admin) }
    : { status: "not_admin" };
}
