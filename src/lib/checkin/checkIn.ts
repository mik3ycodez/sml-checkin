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
import {
  budgetSpent,
  CHECKIN_BUDGET_MS,
  CRITICAL_WRITES_MS,
  remainingMs,
  withBudget,
} from "../tidyhq/budget";
import { isTidyError, TidyError } from "../tidyhq/errors";
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

/**
 * The event, or null if TidyHQ has no such event (a 404). An event with no
 * attendance group is still found: the caller refuses it as unavailable, the
 * same as `checkinBlocker`, rather than calling it unknown.
 */
export async function findEvent(
  client: TidyClient,
  eventId: string,
): Promise<Event | null> {
  try {
    return await client.getEvent(eventId);
  } catch (error) {
    if (isTidyError(error, 404)) return null;
    throw error;
  }
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

/** `readAttendance` for an event with no group: the member is never checked in. */
async function readMember(
  client: TidyClient,
  contactId: string,
): Promise<{ contact: Contact; checkedIn: boolean } | null> {
  const contact = await findContact(client, contactId);
  return contact && { contact, checkedIn: false };
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
 * Order: event → existing check-in → unavailable (archived, then
 * `acceptsCheckIn`, then no attendance group, as in `checkinBlocker`) →
 * check-in window → membership → points. An existing check-in comes first so
 * a member who reloads the page after the window closes, after their
 * membership lapses, or after the event is archived, still sees it. An
 * unavailable event refuses new check-ins even with an open window, so a QR
 * code printed earlier stops working. With no group there is no attendance
 * to read, so only the member is.
 */
export async function assessCheckIn(
  client: TidyClient,
  {
    eventId,
    contactId,
    now,
  }: { eventId: string; contactId: string; now: Date },
): Promise<CheckInAssessment> {
  const event = await findEvent(client, eventId);
  if (!event) return { status: "unknown_event" };
  const groupId = findEventGroup(event);
  return assessCheckInFor(client, {
    contactId,
    now,
    event,
    groupId,
    // Still read alongside the attendance, as before: not awaited here.
    // Without a group the refusal needs no window.
    window: groupId ? getCheckinWindow(client, event) : null,
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
    /** Null for an event with no attendance group: refused, nothing read. */
    groupId: string | null;
    /** Or a read in flight, so it can overlap the attendance read. Unused without a group. */
    window: CheckinWindow | Promise<CheckinWindow> | null;
  },
): Promise<CheckInAssessment> {
  const eventName = event.name;
  // The window is only needed if not already checked in, but fetching it
  // alongside saves a round trip on the common path.
  const [attendance, window] = await Promise.all([
    groupId
      ? readAttendance(client, groupId, contactId)
      : readMember(client, contactId),
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
  if (event.archived || !acceptsCheckIn(event) || !groupId || !window) {
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
 *
 * The whole check-in shares one time budget (`CHECKIN_BUDGET_MS`), so a slow
 * TidyHQ can't push it past the route's 30 seconds: past it, a step fails as
 * a TidyHQ failure (504) like an outage would. Writes are never cut short: the
 * group add and the points write each get their full timeout, so before the
 * group add there must be room for both (`CRITICAL_WRITES_MS`), or nothing is
 * written and the failure is a `group_add` one, safe to retry. Once the point
 * is written, running out of time never fails the check-in: if the budget is
 * spent, the staff note is skipped and logged.
 * A caller that already started a budget (the actions do, to count the access
 * checks too) shortens this one, never extends it.
 */
export function checkIn(
  client: TidyClient,
  input: CheckInInput,
): Promise<CheckInResult> {
  return withBudget(CHECKIN_BUDGET_MS, () => runCheckIn(client, input));
}

async function runCheckIn(
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

  // Both critical writes get their full timeout or nothing is written: the
  // group add alone would put the member in the group, and a points write we
  // then had to cut short could land but be reported as failed.
  const left = remainingMs();
  if (left !== null && left < CRITICAL_WRITES_MS) {
    throw new CheckInFailure(
      "group_add",
      new TidyError(504, "Not enough time left to write the check-in"),
    );
  }

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

/** A TidyError's status and message, or any other error's name. */
function describeError(error: unknown): string {
  return isTidyError(error)
    ? `TidyError ${error.status}: ${error.message}`
    : error instanceof Error
      ? error.name
      : "unknown";
}

/**
 * Leaves the staff check-in note, for a staff check-in only. By now the
 * member is in the group (and, unless the points write failed, has their
 * point), so any failure is logged and swallowed: surfacing it would show
 * an error for a check-in that worked. That includes errors that aren't from
 * TidyHQ, and running out of the time budget (skipped and logged). Logs ids and the error, never the note text.
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
  if (budgetSpent({ write: true })) {
    console.error("staff check-in note skipped", {
      eventId,
      contactId,
      reason: "budget_exhausted",
    });
    return;
  }
  try {
    await client.addNote(
      contactId,
      staffNoteText({ eventId, eventName, staff, now }),
    );
  } catch (error) {
    console.error("staff check-in note failed", {
      eventId,
      contactId,
      error: describeError(error),
    });
  }
}
