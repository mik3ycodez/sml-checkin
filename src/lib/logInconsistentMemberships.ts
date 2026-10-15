import { findInconsistentMemberships } from "./membership";
import type { Membership } from "./tidyhq/types";

/**
 * Warns in the server log about membership records that look wrong (see
 * `findInconsistentMemberships`), so someone can fix them in TidyHQ. Logs the
 * contact and membership ids and the problem, nothing else about the member.
 */
export function logInconsistentMemberships(
  contactId: string,
  memberships: readonly Membership[],
  now: Date,
): void {
  for (const { membership, problem } of findInconsistentMemberships(
    memberships,
    now,
  )) {
    console.warn("inconsistent membership record", {
      contactId,
      membershipId: membership.id,
      problem,
    });
  }
}
