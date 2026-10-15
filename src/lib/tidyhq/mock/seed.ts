import { addDays, seattleDate } from "../../dates";
import { POINTS_FIELD_ID } from "../customFields";
import type {
  Contact,
  Event,
  EventCheckinWindow,
  Group,
  Membership,
  MembershipLevel,
  MembershipState,
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
  /** eventId -> admin-set check-in window; events not listed have none. */
  checkinWindows: Record<string, EventCheckinWindow>;
}

/** Contact id used as the author of notes written with the admin token. */
export const MOCK_ADMIN_CONTACT_ID = "c_admin";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function daysFrom(now: Date, days: number): Date {
  return new Date(now.getTime() + days * DAY_MS);
}

/** `iso` moved by `ms` milliseconds. */
function shiftIso(iso: string, ms: number): string {
  return new Date(new Date(iso).getTime() + ms).toISOString();
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
  const today = seattleDate(now);
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
    member_since: addDays(today, -365),
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
    state: MembershipState = endDays < 0 ? "expired" : "activated",
  ): Membership => {
    return {
      id,
      state,
      status:
        state === "partial"
          ? "Partial"
          : state === "expired"
            ? "Expired"
            : "Activated",
      membership_level_id: levelId,
      contact_id: contactId,
      start_date: addDays(today, startDays),
      end_date: addDays(today, endDays),
      created_at: created,
      updated_at: created,
    };
  };

  const event = (
    id: string,
    name: string,
    start: Date,
    hours: number,
    location: string,
  ): Event => {
    return {
      id,
      name,
      start_at: start.toISOString(),
      end_at: shiftIso(start.toISOString(), hours * HOUR_MS),
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
    grp_social_night: [],
    grp_bootblack_social: [],
    grp_bar_night: [],
    grp_leather_brunch: [],
  };

  const groups = [
    group("grp_pub_night", "Attendees: Pub Night"),
    group("grp_social_night", "Attendees: Social Night"),
    group("grp_bootblack_social", "Attendees: Bootblack Social"),
    group("grp_bar_night", "Attendees: Monthly Bar Night"),
    group("grp_leather_brunch", "Attendees: Leather Brunch"),
  ].map((g) => ({ ...g, size: groupMembers[g.id].length }));

  const events = [
    event(
      "ev_pub_night",
      "Pub Night",
      eveningOf(now, -30),
      3,
      "The Eagle, Seattle",
    ),
    // Started an hour ago when the seed was built. See its window below.
    event(
      "ev_tonight",
      "Social Night",
      new Date(now.getTime() - HOUR_MS),
      4,
      "The Eagle, Seattle",
    ),
    event(
      "ev_bootblack_social",
      "Bootblack Social",
      eveningOf(now, 5),
      3,
      "Capitol Hill",
    ),
    event(
      "ev_bar_night",
      "Monthly Bar Night",
      eveningOf(now, 12),
      4,
      "The Cuff Complex",
    ),
    event(
      "ev_leather_brunch",
      "Leather Brunch",
      eveningOf(now, 26),
      2,
      "Capitol Hill",
    ),
  ];

  // Doors open 30 minutes before start; check-in closes an hour before the
  // event ends. Monthly Bar Night has no window, to exercise the fallback.
  const checkinWindows: Record<string, EventCheckinWindow> = {};
  for (const e of events) {
    if (e.id === "ev_bar_night") continue;
    checkinWindows[e.id] = {
      opens_at: shiftIso(e.start_at!, -HOUR_MS / 2),
      closes_at: shiftIso(e.end_at!, -HOUR_MS),
    };
  }
  // The dev server builds the seed once and keeps it (getTidyClient caches
  // the client), so keep Social Night open for a day after that for manual
  // testing, not just until its end time.
  checkinWindows.ev_tonight.closes_at = shiftIso(now.toISOString(), DAY_MS);

  return {
    contacts: [
      contact("c_marcus", "Marcus", "Bell", 1),
      contact("c_dante", "Dante", "Ruiz", 0),
      contact("c_jordan", "Jordan", "Park", 1),
      // Membership ends in two weeks: exercises the renewal reminder.
      contact("c_sam", "Sam", "Okafor", 0),
      // Membership expired 90 days ago, past the 60-day grace period:
      // check-in should be refused.
      contact("c_lee", "Lee", "Hart", 0),
      // Membership expired 20 days ago: in the grace period, so check-in
      // works, with a renewal message.
      contact("c_robin", "Robin", "Vale", 0),
      // Partial (invoice part-paid) with a future end date: check-in works,
      // with a balance-due message.
      contact("c_avery", "Avery", "Quinn", 0),
    ],
    memberships: [
      membership("m_marcus", "c_marcus", "lvl_full", -120, 245),
      membership("m_dante", "c_dante", "lvl_full", -200, 165),
      membership("m_jordan", "c_jordan", "lvl_associate", -60, 305),
      membership("m_sam", "c_sam", "lvl_full", -351, 14),
      membership("m_lee", "c_lee", "lvl_full", -455, -90),
      membership("m_robin", "c_robin", "lvl_full", -385, -20),
      membership("m_avery", "c_avery", "lvl_full", -100, 265, "partial"),
    ],
    membershipLevels: [
      { id: "lvl_full", name: "Full Member", description: null },
      { id: "lvl_associate", name: "Associate Member", description: null },
    ],
    events,
    groups,
    groupMembers,
    checkinWindows,
  };
}
