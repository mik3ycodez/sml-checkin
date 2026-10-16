import type { TidyClient, TidyMode } from "../tidyhq";
import { contactName } from "../tidyhq/contactName";
import { isTidyError } from "../tidyhq/errors";
import { MOCK_HELPER_GROUP_ID } from "../tidyhq/mock/seed";
import { type AdminGroup, groupFromSetting } from "./admin";

// Who may check members in at the door: contacts in SML's "App Check-In
// Volunteers" group in TidyHQ, and anyone in "App Admin". Like admin access,
// nothing is stored in the session, both groups are read on every call, and
// it fails closed.

/**
 * The volunteers group's id from `HELPER_GROUP_ID`, or why there isn't a
 * usable one. Same rules as `adminGroup`: mock mode falls back to the seed's
 * group when unset; live mode has no default.
 */
export function helperGroup(
  env: { HELPER_GROUP_ID?: string },
  mode: TidyMode,
): AdminGroup {
  return groupFromSetting(env.HELPER_GROUP_ID, MOCK_HELPER_GROUP_ID, mode);
}

export type VolunteerAccess =
  | { status: "admin"; name: string }
  | { status: "volunteer"; name: string }
  | { status: "not_volunteer" }
  /**
   * A group couldn't be read, so we can't say they're not a volunteer.
   * Denied, but different from `not_volunteer`: the Board should look at
   * config or TidyHQ, not at the group's members.
   */
  | { status: "unavailable" };

/** Why a volunteer action turned someone away; derived so it can't drift. */
export type VolunteerDeniedReason = Exclude<
  VolunteerAccess["status"],
  "admin" | "volunteer"
>;

type Contact = Awaited<ReturnType<TidyClient["listGroupContacts"]>>[number];

/**
 * A group's members, or null if it can't be read (logged, with the contact id
 * and TidyHQ's status and message, never tokens; for a non-TidyHQ error, only
 * its name).
 */
async function readGroup(
  client: TidyClient,
  contactId: string,
  which: "helper" | "admin",
  group: AdminGroup,
): Promise<Contact[] | null> {
  if ("problem" in group) {
    console.error("volunteer access unavailable", {
      contactId,
      group: which,
      reason: group.problem,
    });
    return null;
  }
  try {
    return await client.listGroupContacts(group.id);
  } catch (error) {
    console.error("volunteer access unavailable", {
      contactId,
      group: which,
      reason: "read_failed",
      ...(isTidyError(error)
        ? { tidyStatus: error.status, message: error.message }
        : { errorName: error instanceof Error ? error.name : "unknown" }),
    });
    return null;
  }
}

/**
 * Whether the contact may check members in: an admin (App Admin) or a
 * volunteer. Fails closed. Either group being unreadable only matters if the
 * other doesn't already admit them, since a positive answer from one group
 * doesn't depend on the other. If neither admits them and a group couldn't
 * be read, the answer is `unavailable`, not `not_volunteer`.
 */
export async function volunteerAccess(
  client: TidyClient,
  contactId: string,
  helpers: AdminGroup,
  admins: AdminGroup,
): Promise<VolunteerAccess> {
  const [helperMembers, adminMembers] = await Promise.all([
    readGroup(client, contactId, "helper", helpers),
    readGroup(client, contactId, "admin", admins),
  ]);
  const admin = adminMembers?.find((c) => c.id === contactId);
  if (admin) return { status: "admin", name: contactName(admin) };
  const volunteer = helperMembers?.find((c) => c.id === contactId);
  if (volunteer) return { status: "volunteer", name: contactName(volunteer) };
  return helperMembers && adminMembers
    ? { status: "not_volunteer" }
    : { status: "unavailable" };
}
