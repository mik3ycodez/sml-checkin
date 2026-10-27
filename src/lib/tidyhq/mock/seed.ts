import { addDays, seattleDate } from "../../dates";
import { COLORS_ISSUED_FIELD_ID, POINTS_FIELD_ID } from "../customFields";
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

/** Each seed event's attendance group (see `Event.attendance_group_id`). */
const EVENT_GROUPS: Record<string, string> = {
  ev_pub_night: "grp_pub_night",
  ev_tonight: "grp_social_night",
  ev_bootblack_social: "grp_bootblack_social",
  ev_bar_night: "grp_bar_night",
  ev_leather_brunch: "grp_leather_brunch",
};

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

/** The mock's App Admin group, used when `ADMIN_GROUP_ID` is unset. */
export const MOCK_ADMIN_GROUP_ID = "grp_app_admin";

/** The mock's App Check-In Volunteers group, used when `HELPER_GROUP_ID` is unset. */
export const MOCK_HELPER_GROUP_ID = "grp_app_checkin_volunteers";

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
    colorsIssued = false,
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
      [COLORS_ISSUED_FIELD_ID]: {
        id: COLORS_ISSUED_FIELD_ID,
        title: "Club colors issued",
        type: "string",
        value: colorsIssued ? "yes" : "",
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
      // The mock links its events to their groups explicitly (the live client
      // can't yet: see `eventGroups.ts`).
      attendance_group_id: EVENT_GROUPS[id] ?? null,
      created_at: created,
      updated_at: created,
    };
  };

  const group = (
    id: string,
    label: string,
    description = "Event attendance (managed by SML Check-in)",
  ): Group => ({
    id,
    label,
    description,
    size: 0,
    created_at: created,
  });

  const groupMembers: Record<string, string[]> = {
    // Marcus and Jordan attended last month's pub night.
    grp_pub_night: ["c_marcus", "c_jordan"],
    // Non-event groups, which /me must never show as events.
    grp_members: ["c_marcus", "c_jordan", "c_dante"],
    grp_volunteers: ["c_marcus"],
    // The Board and social coordinator: who may use the admin pages.
    [MOCK_ADMIN_GROUP_ID]: ["c_casey"],
    // Door volunteers, who aren't admins.
    [MOCK_HELPER_GROUP_ID]: ["c_pat"],
    grp_social_night: [],
    grp_bootblack_social: [],
    grp_bar_night: [],
    grp_leather_brunch: [],
  };

  const groups = [
    // Pub Night's group is archived in TidyHQ's admin screens (it was last
    // month), but v1 doesn't say so; the contact's group list still has it.
    group("grp_pub_night", "Attendees: Pub Night"),
    group("grp_social_night", "Attendees: Social Night"),
    group("grp_bootblack_social", "Attendees: Bootblack Social"),
    group("grp_bar_night", "Attendees: Monthly Bar Night"),
    group("grp_leather_brunch", "Attendees: Leather Brunch"),
    group("grp_members", "Members", "All current members"),
    group("grp_volunteers", "Volunteers", "Event volunteers"),
    group(
      MOCK_ADMIN_GROUP_ID,
      "App Admin",
      "Can use the SML Check-in admin pages (managed in TidyHQ)",
    ),
    group(
      MOCK_HELPER_GROUP_ID,
      "App Check-In Volunteers",
      "Can check members in at the door (managed in TidyHQ)",
    ),
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
    // Open now, but with no attendance group (not in EVENT_GROUPS): check-in
    // can't record anyone, so every screen refuses it.
    event(
      "ev_no_group",
      "Pop-up Meetup",
      // Half an hour after Social Night, so event order never ties.
      new Date(now.getTime() - HOUR_MS / 2),
      4,
      "Volunteer Park",
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

  // Marcus has a photo (a generated avatar in public/mock, not SML's); everyone
  // else has none, so e2e covers both the photo and initials paths.
  const marcus = contact("c_marcus", "Marcus", "Bell", 1);
  marcus.profile_image = "/mock/marcus.svg";
  return {
    contacts: [
      marcus,
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
      // 17 points, colors not issued: the next check-in qualifies them for
      // club colors.
      contact("c_riley", "Riley", "Frost", 17),
      // Exactly 18 points, colors not issued: qualified for club colors.
      contact("c_taylor", "Taylor", "Brandt", 18),
      // 25 points, colors issued.
      contact("c_morgan", "Morgan", "Hale", 25, true),
      // A Board member, in the App Admin group.
      contact("c_casey", "Casey", "Moreno", 3),
      // A door volunteer, in the App Check-In Volunteers group but not App Admin.
      contact("c_pat", "Pat", "Rivera", 2),
      // Only membership is `expired` with a future end date: an inconsistent
      // record, refused at check-in and flagged to admins.
      contact("c_kai", "Kai", "Mercer", 0),
    ],
    memberships: [
      membership("m_marcus", "c_marcus", "lvl_full", -120, 245),
      membership("m_dante", "c_dante", "lvl_full", -200, 165),
      membership("m_jordan", "c_jordan", "lvl_associate", -60, 305),
      membership("m_sam", "c_sam", "lvl_full", -351, 14),
      membership("m_lee", "c_lee", "lvl_full", -455, -90),
      membership("m_robin", "c_robin", "lvl_full", -385, -20),
      membership("m_avery", "c_avery", "lvl_full", -100, 265, "partial"),
      membership("m_riley", "c_riley", "lvl_full", -90, 275),
      membership("m_taylor", "c_taylor", "lvl_full", -150, 215),
      membership("m_morgan", "c_morgan", "lvl_full", -200, 165),
      membership("m_casey", "c_casey", "lvl_full", -150, 215),
      membership("m_pat", "c_pat", "lvl_full", -110, 255),
      membership("m_kai", "c_kai", "lvl_full", -100, 265, "expired"),
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
