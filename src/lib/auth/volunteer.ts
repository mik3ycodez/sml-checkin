import type { TidyClient, TidyMode } from "../tidyhq";
import { contactName } from "../tidyhq/contactName";
import { MOCK_HELPER_GROUP_ID } from "../tidyhq/mock/seed";
import {
  type GroupSetting,
  groupFromSetting,
  readGroupMembers,
} from "./groupAccess";

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
): GroupSetting {
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

/**
 * Whether the contact may check members in: an admin (App Admin) or a
 * volunteer. Fails closed. A positive answer from one group doesn't depend on
 * the other, so an unreadable group matters only if nothing else admits them:
 * then the answer is `unavailable`, not `not_volunteer`, since they might be
 * in the group we couldn't read.
 *
 * Failures are logged only in that case. If the person was admitted, the
 * broken group changed nothing, and logging it would fill the log with false
 * errors (for example every admin's request while `HELPER_GROUP_ID` isn't
 * set yet).
 *
 * Someone in both groups while the admin group is unreadable comes back as
 * `volunteer`, not `admin`: the higher role can't be confirmed, so they get
 * the lesser one until TidyHQ recovers. It fails closed, never upward.
 */
export async function volunteerAccess(
  client: TidyClient,
  contactId: string,
  helpers: GroupSetting,
  admins: GroupSetting,
): Promise<VolunteerAccess> {
  const [helperRead, adminRead] = await Promise.all([
    readGroupMembers(client, helpers),
    readGroupMembers(client, admins),
  ]);
  const admin =
    "members" in adminRead && adminRead.members.find((c) => c.id === contactId);
  if (admin) return { status: "admin", name: contactName(admin) };
  const volunteer =
    "members" in helperRead &&
    helperRead.members.find((c) => c.id === contactId);
  if (volunteer) return { status: "volunteer", name: contactName(volunteer) };

  if ("members" in helperRead && "members" in adminRead)
    return { status: "not_volunteer" };
  for (const [group, read] of [
    ["helper", helperRead],
    ["admin", adminRead],
  ] as const) {
    if ("failure" in read)
      console.error("volunteer access unavailable", {
        contactId,
        group,
        ...read.failure,
      });
  }
  return { status: "unavailable" };
}
