import { POINTS_FIELD_ID } from "../customFields";
import type {
  Contact,
  Event,
  Group,
  Membership,
  MembershipLevel,
} from "../types";

/** All mock TidyHQ state. MockTidyClient clones this, so tests stay isolated. */
export interface MockSeed {
  contacts: Contact[];
  memberships: Membership[];
  membershipLevels: MembershipLevel[];
  events: Event[];
  groups: Group[];
  /** groupId -> contact ids in that group */
  groupMembers: Record<string, string[]>;
}

/** Contact id used as the author of notes written with the admin token. */
export const MOCK_ADMIN_CONTACT_ID = "c_admin";

const DAY_MS = 24 * 60 * 60 * 1000;

function daysFrom(now: Date, days: number): Date {
  return new Date(now.getTime() + days * DAY_MS);
}

/** `YYYY-MM-DD` */
function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** An evening start: 02:00 UTC is 7pm in Seattle (PDT). */
function eveningOf(now: Date, days: number): Date {
  const date = daysFrom(now, days);
  date.setUTCHours(2, 0, 0, 0);
  return date;
}

/**
 * Builds seed data with dates relative to `now`, so dev data never goes stale
 * and tests are deterministic when given a fixed date.
 */
export function createSeed(now: Date = new Date()): MockSeed {
  const created = daysFrom(now, -400).toISOString();

  const contact = (
    id: string,
    first: string,
    last: string,
    points: number,
  ): Contact => ({
    id,
    display_name: `${first} ${last}`,
    first_name: first,
    last_name: last,
    nick_name: "",
    email_address: `${first.toLowerCase()}@example.com`,
    status: "active",
    member_since: dateOnly(daysFrom(now, -365)),
    created_at: created,
    updated_at: created,
    custom_fields: {
      [POINTS_FIELD_ID]: {
        id: POINTS_FIELD_ID,
        title: "SML Points",
        type: "string",
        value: String(points),
      },
    },
    notes: [],
  });

  const membership = (
    id: string,
    contactId: string,
    levelId: string,
    startDays: number,
    endDays: number,
  ): Membership => {
    const expired = endDays < 0;
    return {
      id,
      state: expired ? "expired" : "activated",
      status: expired ? "Expired" : "Activated",
      membership_level_id: levelId,
      contact_id: contactId,
      start_date: dateOnly(daysFrom(now, startDays)),
      end_date: dateOnly(daysFrom(now, endDays)),
      created_at: created,
      updated_at: created,
    };
  };

  const event = (
    id: string,
    name: string,
    days: number,
    hours: number,
    location: string,
  ): Event => {
    const start = eveningOf(now, days);
    return {
      id,
      name,
      start_at: start.toISOString(),
      end_at: new Date(start.getTime() + hours * 60 * 60 * 1000).toISOString(),
      body: `<p>${name} with Seattle Men in Leather.</p>`,
      location,
      public: true,
      archived: false,
      created_at: created,
      updated_at: created,
    };
  };

  const group = (id: string, label: string): Group => ({
    id,
    label,
    description: "Event attendance (managed by SML Check-in)",
    size: 0,
    created_at: created,
    updated_at: created,
  });

  const groupMembers: Record<string, string[]> = {
    // Marcus and Jordan attended last month's pub night.
    grp_pub_night: ["c_marcus", "c_jordan"],
    grp_bootblack_social: [],
    grp_bar_night: [],
    grp_leather_brunch: [],
  };

  const groups = [
    group("grp_pub_night", "Attendees: Pub Night"),
    group("grp_bootblack_social", "Attendees: Bootblack Social"),
    group("grp_bar_night", "Attendees: Monthly Bar Night"),
    group("grp_leather_brunch", "Attendees: Leather Brunch"),
  ].map((g) => ({ ...g, size: groupMembers[g.id].length }));

  return {
    contacts: [
      contact("c_marcus", "Marcus", "Bell", 1),
      contact("c_dante", "Dante", "Ruiz", 0),
      contact("c_jordan", "Jordan", "Park", 1),
      // Membership ends in two weeks: exercises the renewal reminder.
      contact("c_sam", "Sam", "Okafor", 0),
      // Membership expired last month: check-in should be refused.
      contact("c_lee", "Lee", "Hart", 0),
    ],
    memberships: [
      membership("m_marcus", "c_marcus", "lvl_full", -120, 245),
      membership("m_dante", "c_dante", "lvl_full", -200, 165),
      membership("m_jordan", "c_jordan", "lvl_associate", -60, 305),
      membership("m_sam", "c_sam", "lvl_full", -351, 14),
      membership("m_lee", "c_lee", "lvl_full", -405, -40),
    ],
    membershipLevels: [
      { id: "lvl_full", name: "Full Member", description: null },
      { id: "lvl_associate", name: "Associate Member", description: null },
    ],
    events: [
      event("ev_pub_night", "Pub Night", -30, 3, "The Eagle, Seattle"),
      event("ev_bootblack_social", "Bootblack Social", 5, 3, "Capitol Hill"),
      event("ev_bar_night", "Monthly Bar Night", 12, 4, "The Cuff Complex"),
      event("ev_leather_brunch", "Leather Brunch", 26, 2, "Capitol Hill"),
    ],
    groups,
    groupMembers,
  };
}
