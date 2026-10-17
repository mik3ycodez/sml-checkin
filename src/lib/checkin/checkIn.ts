import { logInconsistentMemberships } from "../logInconsistentMemberships";
import {
  membershipNotice,
  membershipStanding,
  type MembershipNotice,
} from "../membership";
import { POINTS_PER_CHECKIN, type CheckInMethod } from "../points";
import {
  newlyQualified,
  rewardEntries,
  rewardStanding,
  type QualifiedReward,
  type RewardEntry,
  type RewardStanding,
} from "../rewards";
import {
  getCheckinWindow,
  isCheckinOpen,
  type CheckinWindow,
} from "../tidyhq/checkinWindow";
import type { TidyClient } from "../tidyhq/client";
import { contactName } from "../tidyhq/contactName";
import { findContact } from "../tidyhq/contacts";
import { acceptsCheckIn } from "../tidyhq/acceptsCheckIn";
import { buildPointsPatch, readPoints } from "../tidyhq/customFields";
import { isTidyError, type TidyError } from "../tidyhq/errors";
import { findEventGroup } from "../tidyhq/eventGroups";
import { isInGroup } from "../tidyhq/groups";
import { staffNoteText, type StaffActor } from "./staffNote";
import type { Contact, Event } from "../tidyhq/types";

/**
 * A staff check-in must say who did it, so TypeScript rejects one that
 * doesn't: the note names them.
 */
export type CheckInInput = {
  eventId: string;
  contactId: string;
  now: Date;
} & (
  | { method?: Extract<CheckInMethod, "self"> }
  | { method: Extract<CheckInMethod, "staff">; staff: StaffActor }
);

/** What a refusal knows about the member: staff see the stored total. */
interface Known {
  name: string;
  eventName: string | null;
  /** Null if the stored total is unreadable. */
  total: number | null;
}

/** Why a member can't check in. The same reasons whether asked before or at the tap. */
export type CheckInRefusal =
  | (Known & { status: "membership_inactive" })
  /** The stored total isn't a plain whole number; a volunteer must fix it. */
  | (Known & { status: "points_unreadable" })
  | (Known & { status: "not_open"; opensAt: Date })
  | (Known & { status: "closed" })
  /** Archived in TidyHQ: not an event to check in to, whatever its window says. */
  | (Known & { status: "event_unavailable" })
  | { status: "unknown_event" }
  /** The session names a contact TidyHQ no longer has (merged or deleted). */
  | { status: "unknown_contact" };

export type CheckInResult =
  | {
      status: "checked_in";
      name: string;
      eventName: string | null;
      pointsAwarded: number;
      total: number;
      /** A balance due or grace-period message to show with the confirmation. */
      membershipNotice: MembershipNotice | null;
      /** Rewards this check-in's points just reached. */
      qualified: QualifiedReward[];
    }
  | {
      status: "already_checked_in";
      name: string;
      eventName: string | null;
      /** Null if the stored total is unreadable. */
      total: number | null;
    }
  | CheckInRefusal;

/** Where a check-in failed: reading TidyHQ, adding to the group, or writing points. */
export type CheckInStep = "lookup" | "group_add" | "points_write";

/**
 * TidyHQ failed (e.g. it's down) partway through a check-in. `step` says how
 * far it got: a `points_write` failure means the member was added to the
 * group but missed their point.
 */
export class CheckInFailure extends Error {
  constructor(
    readonly step: CheckInStep,
    override readonly cause: TidyError,
    /** The message the member would have seen, for a `points_write` failure. */
    readonly membershipNotice: MembershipNotice | null = null,
  ) {
    super(`Check-in failed at ${step}`, { cause });
    this.name = "CheckInFailure";
  }
}

/**
 * Runs one step, turning a TidyHQ failure into a CheckInFailure for that
 * step. Anything else is a bug, and is thrown unchanged so the error page and
 * Next.js's own logging see it. (The live client must report network
 * failures as TidyErrors for them to count as TidyHQ failures.)
 */
async function step<T>(
  name: CheckInStep,
  run: () => Promise<T>,
  notice: MembershipNotice | null = null,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isTidyError(error)) throw new CheckInFailure(name, error, notice);
    throw error;
  }
}

/** The event and its attendance group, or null if either is missing. */
export async function findEvent(
  client: TidyClient,
  eventId: string,
): Promise<{ event: Event; groupId: string } | null> {
  let event: Event;
  try {
    event = await client.getEvent(eventId);
  } catch (error) {
    if (isTidyError(error, 404)) return null;
    throw error;
  }
  const groupId = findEventGroup(event);
  return groupId ? { event, groupId } : null;
}

/**
 * The member's contact (with their stored points) and whether they're in the
 * event's attendance group (`isInGroup`), or null if the contact is gone.
 *
 * The contact is read before the group, never alongside it. Otherwise an
 * overlapping check-in could land between the two reads: this request would
 * see "not checked in" but the other's new total, and award twice.
 */
export async function readAttendance(
  client: TidyClient,
  groupId: string,
  contactId: string,
): Promise<{ contact: Contact; checkedIn: boolean } | null> {
  const contact = await findContact(client, contactId);
  if (!contact) return null;
  return { contact, checkedIn: await isInGroup(client, groupId, contactId) };
}

/**
 * Where a member stands at an event, before anything is written. The pages
 * show this directly: `already_checked_in` means "in the event's group",
 * whether or not they just tapped.
 */
export type CheckInAssessment =
  | CheckInRefusal
  | {
      status: "already_checked_in";
      name: string;
      eventName: string | null;
      total: number | null;
    }
  | {
      status: "ready";
      name: string;
      eventName: string | null;
      groupId: string;
      /** The stored points total, readable. */
      stored: number;
      membershipNotice: MembershipNotice | null;
      /** Rewards as of the stored total, before this check-in. */
      rewards: RewardEntry[];
      rewardStanding: RewardStanding;
    };

/**
 * The check-in rules, read-only: whether this member may check in now, and if
 * not, why. `checkIn` acts on it, and the pages show it before the tap, so the
 * two can never disagree. Unexpected TidyHQ failures throw.
 *
 * Order: event → existing check-in → archived → check-in window → membership
 * → points. An existing check-in comes first so a member who reloads the page
 * after the window closes, after their membership lapses, or after the event
 * is archived, still sees it. An archived event refuses new check-ins even
 * with an open window, so a QR code printed earlier stops working. An event
 * that fails `acceptsCheckIn` is refused the same way (`checkinBlocker` agrees).
 */
export async function assessCheckIn(
  client: TidyClient,
  {
    eventId,
    contactId,
    now,
  }: { eventId: string; contactId: string; now: Date },
): Promise<CheckInAssessment> {
  const found = await findEvent(client, eventId);
  if (!found) return { status: "unknown_event" };
  const { event, groupId } = found;
  return assessCheckInFor(client, {
    contactId,
    now,
    event,
    groupId,
    // Still read alongside the attendance, as before: not awaited here.
    window: getCheckinWindow(client, event),
  });
}

/**
 * `assessCheckIn` for a caller that has already read the event, its group and
 * its window (the staff page, which needs them for its own check). Same rules,
 * no repeat reads of them.
 */
export async function assessCheckInFor(
  client: TidyClient,
  {
    contactId,
    now,
    event,
    groupId,
    window: windowRead,
  }: {
    contactId: string;
    now: Date;
    event: Event;
    groupId: string;
    /** Or a read in flight, so it can overlap the attendance read. */
    window: CheckinWindow | Promise<CheckinWindow>;
  },
): Promise<CheckInAssessment> {
  const eventName = event.name;
  // The window is only needed if not already checked in, but fetching it
  // alongside saves a round trip on the common path.
  const [attendance, window] = await Promise.all([
    readAttendance(client, groupId, contactId),
    windowRead,
  ]);
  if (!attendance) return { status: "unknown_contact" };
  const { contact } = attendance;
  const name = contactName(contact);
  if (attendance.checkedIn) {
    return {
      status: "already_checked_in",
      name,
      eventName,
      total: readPoints(contact),
    };
  }

  const total = readPoints(contact);
  if (event.archived || !acceptsCheckIn(event)) {
    return { status: "event_unavailable", name, eventName, total };
  }

  const open = isCheckinOpen(window, now);
  if (open === "not_yet") {
    return {
      status: "not_open",
      name,
      eventName,
      total,
      opensAt: window.opensAt!,
    };
  }
  if (open === "closed") return { status: "closed", name, eventName, total };

  const memberships = await client.getMemberships(contactId);
  // Current members and those in the grace period may check in.
  logInconsistentMemberships(contactId, memberships, now);
  const standing = membershipStanding(memberships, now);
  if (standing.kind !== "current" && standing.kind !== "grace") {
    return { status: "membership_inactive", name, eventName, total };
  }

  const stored = total;
  if (stored === null) {
    return { status: "points_unreadable", name, eventName, total };
  }
  return {
    status: "ready",
    name,
    eventName,
    groupId,
    stored,
    membershipNotice: membershipNotice(standing),
    rewards: rewardEntries(contact, stored),
    rewardStanding: rewardStanding(standing),
  };
}

/**
 * Self or staff check-in for one member at one event. Returns what happened
 * rather than throwing, so pages only need to render the result. Unexpected
 * failures (e.g. TidyHQ being down) throw a `CheckInFailure` naming the step.
 *
 * The stored points field is the source of truth (it includes migrated
 * balances and admin adjustments), so points are added to it, never
 * recalculated. A member already in the event's group gets nothing. The group
 * add happens before the points write, so a failure in between may miss a
 * point but a retry can never award it twice. An unreadable stored total is
 * never overwritten; the member isn't checked in until it's fixed.
 */
export async function checkIn(
  client: TidyClient,
  input: CheckInInput,
): Promise<CheckInResult> {
  const { eventId, contactId, now } = input;
  const assessment = await step("lookup", () =>
    assessCheckIn(client, { eventId, contactId, now }),
  );
  if (assessment.status !== "ready") return assessment;
  const { name, eventName, groupId, stored } = assessment;
  const { membershipNotice: notice, rewards } = assessment;

  await step("group_add", () => client.addContactToGroup(groupId, contactId));
  const pointsAwarded = POINTS_PER_CHECKIN;
  const total = stored + pointsAwarded;
  const noteInput = {
    eventId,
    contactId,
    eventName,
    staff: input.method === "staff" ? input.staff : null,
    now,
  };
  try {
    await step(
      "points_write",
      () => client.updateContact(contactId, buildPointsPatch(total)),
      notice,
    );
  } catch (error) {
    // In the group without the point: the note is still how a staff check-in
    // is told from a self one, and who did it. It never touches points.
    await writeStaffNote(client, noteInput);
    throw error;
  }
  // Last, so a failed note can't affect the group or the points.
  await writeStaffNote(client, noteInput);
  return {
    status: "checked_in",
    name,
    eventName,
    pointsAwarded,
    total,
    membershipNotice: notice,
    // Worked out from the read before the write, with the standing check-in
    // itself used, so the confirmation can't disagree with this check-in.
    qualified: newlyQualified(rewards, pointsAwarded).map((reward) => ({
      rewardId: reward.id,
      standing: assessment.rewardStanding,
    })),
  };
}

/**
 * Leaves the staff check-in note, for a staff check-in only. By now the
 * member is in the group (and, unless the points write failed, has their
 * point), so any failure is logged and swallowed: surfacing it would show
 * an error for a check-in that worked. That includes errors that aren't from
 * TidyHQ. Logs ids and the error, never the note text.
 */
async function writeStaffNote(
  client: TidyClient,
  {
    eventId,
    contactId,
    eventName,
    staff,
    now,
  }: {
    eventId: string;
    contactId: string;
    eventName: string | null;
    /** Null for a self check-in, which leaves no note. */
    staff: StaffActor | null;
    now: Date;
  },
): Promise<void> {
  if (!staff) return;
  try {
    await client.addNote(
      contactId,
      staffNoteText({ eventId, eventName, staff, now }),
    );
  } catch (error) {
    console.error("staff check-in note failed", {
      eventId,
      contactId,
      error: isTidyError(error)
        ? `TidyError ${error.status}: ${error.message}`
        : error instanceof Error
          ? error.name
          : "unknown",
    });
  }
}
