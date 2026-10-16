import { logInconsistentMemberships } from "../logInconsistentMemberships";
import { membershipStanding } from "../membership";
import { REWARDS } from "../points";
import { rewardStanding, rewardStatus, type RewardStanding } from "../rewards";
import type { TidyClient } from "../tidyhq/client";
import { contactName } from "../tidyhq/contactName";
import { readPoints, readRewardIssued } from "../tidyhq/customFields";
import type { Contact } from "../tidyhq/types";

/** A member who qualifies for colors and hasn't been marked issued. */
export interface OwedMember {
  contactId: string;
  name: string;
  points: number;
  standing: RewardStanding;
}

/** A member whose points or issued field can't be read, so we won't guess. */
export interface UncheckedMember {
  contactId: string;
  name: string;
  problem: "points" | "issued" | "both";
}

export interface ColorsOwed {
  /** Current, fully paid: the Board can hand over colors. */
  ready: OwedMember[];
  /** Qualify by points but must renew or finish paying first. */
  renewFirst: OwedMember[];
  needsChecking: UncheckedMember[];
}

/** Colors are the only reward with a points threshold for now. */
const COLORS = REWARDS.find((r) => r.id === "club_colors")!;

/** Memberships read at once, so a big club doesn't fire hundreds together. */
const BATCH_SIZE = 10;

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name);

/**
 * Who is owed club colors, for the Board's cross-check. Uses the same rules
 * as `/me`: `rewardStatus` for the points and issued field, and
 * `membershipStanding` (via `rewardStanding`) for the membership. Read-only.
 * Memberships are read only for those who qualify. Any TidyHQ failure throws,
 * so the caller never shows a partial list as complete.
 */
export async function getColorsOwed(
  client: TidyClient,
  { now }: { now: Date },
): Promise<ColorsOwed> {
  const contacts = await client.listAllContacts();
  const qualified: { contact: Contact; points: number }[] = [];
  const needsChecking: UncheckedMember[] = [];

  for (const contact of contacts) {
    const points = readPoints(contact);
    const issued = readRewardIssued(contact, COLORS.id);
    const status = rewardStatus(COLORS, points, issued);
    if (status === null) {
      needsChecking.push({
        contactId: contact.id,
        name: contactName(contact),
        problem:
          points === null && issued === null
            ? "both"
            : points === null
              ? "points"
              : "issued",
      });
    } else if (status.kind === "qualified" && points !== null) {
      qualified.push({ contact, points });
    }
  }

  const owed: OwedMember[] = [];
  for (let i = 0; i < qualified.length; i += BATCH_SIZE) {
    const batch = qualified.slice(i, i + BATCH_SIZE);
    owed.push(
      ...(await Promise.all(
        batch.map(async ({ contact, points }) => {
          const memberships = await client.getMemberships(contact.id);
          logInconsistentMemberships(contact.id, memberships, now);
          return {
            contactId: contact.id,
            name: contactName(contact),
            points,
            standing: rewardStanding(membershipStanding(memberships, now)),
          };
        }),
      )),
    );
  }

  return {
    ready: owed.filter((m) => m.standing === "current").sort(byName),
    renewFirst: owed.filter((m) => m.standing !== "current").sort(byName),
    needsChecking: needsChecking.sort(byName),
  };
}
