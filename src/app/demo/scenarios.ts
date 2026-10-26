import { VOLUNTEER_GENERIC_REFUSAL } from "@/lib/checkin/staffVerdict";
import { findReward, rewardMessage } from "@/lib/rewards";
import { ADMIN_PATH, adminEventPath } from "../admin/paths";
import { checkinPath, ME_PATH, staffCheckinPath } from "../memberPaths";

// The demo walkthrough's content. Every screen text in "straight double
// quotes" is checked against the app's source by `scenarios.test.ts`, and the
// members, events and search terms against the mock seed, so rewording a
// screen or changing the seed fails a test instead of leaving this wrong.
// Text that varies (dates, names, totals) is written without quotes.

/** The page a scenario starts on, which the person reaches after signing in. */
export type Target =
  | { kind: "checkin" | "adminEvent" | "staff"; eventId: string }
  | { kind: "me" | "admin" };

/** Built with the app's own path helpers, never written out by hand. */
export function targetPath(target: Target): string {
  switch (target.kind) {
    case "checkin":
      return checkinPath(target.eventId);
    case "adminEvent":
      return adminEventPath(target.eventId);
    case "staff":
      return staffCheckinPath(target.eventId);
    case "me":
      return ME_PATH;
    case "admin":
      return ADMIN_PATH;
  }
}

export interface Part {
  /** The seed contact to sign in as. */
  memberId: string;
  /** As the mock sign-in list shows them (`contactName`). */
  memberName: string;
  /** Names the page or event, when a scenario has more than one part. */
  heading?: string;
  target: Target;
  steps: string[];
  see: string[];
  /** Each name search the steps type, and the one member it must find. */
  searches?: { term: string; memberId: string }[];
}

export interface Scenario {
  number: number;
  title: string;
  parts: Part[];
  /** What a tester sees if someone already ran this on the shared demo. */
  alreadyRun: string;
}

const SOCIAL_NIGHT = "ev_tonight";
const CLUB_COLORS = findReward("club_colors")!;
const QUALIFIED = rewardMessage(CLUB_COLORS, { kind: "qualified" }, "current");
const ISSUED = rewardMessage(CLUB_COLORS, { kind: "issued" }, "current");
const COUNTDOWN = rewardMessage(
  CLUB_COLORS,
  { kind: "progress", remaining: 18 },
  "current",
);

export const SCENARIOS: Scenario[] = [
  {
    number: 1,
    title: "Member check-in and repeat",
    parts: [
      {
        memberId: "c_dante",
        memberName: "Dante Ruiz",
        target: { kind: "checkin", eventId: SOCIAL_NIGHT },
        steps: [
          `You land on Social Night with a big "Check in" button. Before tapping it, open this same page in a second tab: duplicate the tab, or copy the address into a new one.`,
          `In the first tab, tap "Check in".`,
          `In the second tab, which still shows the old button, tap "Check in" too. The Back button won't do this: it reloads the page, which by then says you're already checked in.`,
        ],
        see: [
          `After the first tap: "You're checked in" with the member's name, +1 point, and the new total (1).`,
          `After the second tap: "You're already checked in" and "One check-in per event, so no extra point this time." The total stays 1.`,
          `"See your points" opens the member status page.`,
        ],
      },
    ],
    alreadyRun: `There is no "Check in" button. You see "You're already checked in" and the member's total. Ask for a Restart to try the first tap again.`,
  },
  {
    number: 2,
    title: "Reaching club colors on check-in",
    parts: [
      {
        memberId: "c_riley",
        memberName: "Riley Frost",
        target: { kind: "checkin", eventId: SOCIAL_NIGHT },
        steps: [
          `Tap "Check in" on Social Night. Riley starts at 17 points, one short of club colors.`,
          `Tap "See your points" to open the status page.`,
        ],
        see: [
          `"You're checked in", +1 point, and a total of 18.`,
          `The message "${QUALIFIED}" is shown because this check-in's point reached 18.`,
          `The status page shows the same message.`,
        ],
      },
    ],
    alreadyRun: `You see "You're already checked in" with a total of 18, and no club colors message on that screen. The status page still shows "${QUALIFIED}"`,
  },
  {
    number: 3,
    title: "Grace period and balance due",
    parts: [
      {
        memberId: "c_robin",
        memberName: "Robin Vale",
        heading: "Grace period",
        target: { kind: "checkin", eventId: SOCIAL_NIGHT },
        steps: [
          `Tap "Check in" on Social Night. The membership ended 20 days ago, within the 60-day grace period, so check-in still works.`,
        ],
        see: [
          `"You're checked in", +1 point and a total of 1.`,
          `A notice that the membership expired on a date and to renew by a later date, with a "Renew on TidyHQ" link to SML's TidyHQ site. You don't need to follow it.`,
        ],
      },
      {
        memberId: "c_avery",
        memberName: "Avery Quinn",
        heading: "Balance due",
        target: { kind: "checkin", eventId: SOCIAL_NIGHT },
        steps: [
          `Tap "Check in" on Social Night. The membership is partly paid, with an end date still ahead, so check-in works.`,
        ],
        see: [
          `"You're checked in", +1 point and a total of 1.`,
          `"You have a balance due. Complete payment in TidyHQ." with a "Pay on TidyHQ" link.`,
        ],
      },
    ],
    alreadyRun: `For either member you see "You're already checked in" with no notice on that screen. The status page still shows the grace period or balance due notice.`,
  },
  {
    number: 4,
    title: "Refused: lapsed and inconsistent record",
    parts: [
      {
        memberId: "c_lee",
        memberName: "Lee Hart",
        heading: "Lapsed",
        target: { kind: "checkin", eventId: SOCIAL_NIGHT },
        steps: [
          `Open Social Night. The membership ended 90 days ago, past the grace period, so there is no "Check in" button.`,
        ],
        see: [
          `"Your membership isn't active" and "Check-in is for current SML members."`,
          `Two buttons: "Renew on TidyHQ" and "I've renewed, check me in".`,
        ],
      },
      {
        memberId: "c_kai",
        memberName: "Kai Mercer",
        heading: "Inconsistent record",
        target: { kind: "checkin", eventId: SOCIAL_NIGHT },
        steps: [
          `Open Social Night. The only membership is marked expired but its end date is still ahead, which should not happen in TidyHQ, so the app refuses it.`,
        ],
        see: [
          `The same "Your membership isn't active" screen as Lee. Members aren't told about the data problem; admins see a warning in scenario 9.`,
        ],
      },
    ],
    alreadyRun: `The same for everyone, since these members never check in.`,
  },
  {
    number: 5,
    title: "Refused events: no group and not open yet",
    parts: [
      {
        memberId: "c_marcus",
        memberName: "Marcus Bell",
        heading: "Pop-up Meetup (no attendance group)",
        target: { kind: "checkin", eventId: "ev_no_group" },
        steps: [
          `Open Pop-up Meetup. Its check-in window is open, but the event has no group to record attendance in.`,
        ],
        see: [
          `"This event isn't open for check-in" and "Check-in isn't available for this event."`,
        ],
      },
      {
        memberId: "c_marcus",
        memberName: "Marcus Bell",
        heading: "Bootblack Social (not open yet)",
        target: { kind: "checkin", eventId: "ev_bootblack_social" },
        steps: [
          `Open Bootblack Social, about five days after the last Restart.`,
        ],
        see: [
          `"Check-in hasn't opened yet", the time check-in opens, and "Scan the code again then."`,
        ],
      },
    ],
    alreadyRun: `The same for everyone. Bootblack Social is about five days after a Restart, so once the demo has run that long it opens and shows the "Check in" button.`,
  },
  {
    number: 6,
    title: "Messages on the status page",
    parts: [
      {
        memberId: "c_sam",
        memberName: "Sam Okafor",
        heading: "Renewal reminder",
        target: { kind: "me" },
        steps: [
          `The status page opens: the member's name, level, points, membership, rewards and "Recent events".`,
        ],
        see: [
          `"Your membership ends on" a date about two weeks away, with a "Renew on TidyHQ" link.`,
          `The countdown "${COUNTDOWN}" if the total is still 0.`,
        ],
      },
      {
        memberId: "c_morgan",
        memberName: "Morgan Hale",
        heading: "Colors issued",
        target: { kind: "me" },
        steps: [`The status page opens.`],
        see: [
          `A total of 25 and "${ISSUED}", with "Active until" the membership's end date.`,
        ],
      },
      {
        memberId: "c_taylor",
        memberName: "Taylor Brandt",
        heading: "You qualify",
        target: { kind: "me" },
        steps: [
          `The status page opens. Taylor has exactly 18 points and no colors issued, so this works even after Riley's check-in is used up.`,
        ],
        see: [`A total of 18 and "${QUALIFIED}"`],
      },
    ],
    alreadyRun: `The same for everyone.`,
  },
  {
    number: 7,
    title: "Admin: events, QR code and live attendees",
    parts: [
      {
        memberId: "c_casey",
        memberName: "Casey Moreno",
        target: { kind: "admin" },
        steps: [
          `The admin page lists the events. Tap Social Night.`,
          `Below the event are "Check-in is open.", a "Staff check-in" button, the QR code with its link underneath (it ends ${checkinPath(SOCIAL_NIGHT)}), and the list of who has checked in.`,
          `To watch the list update, keep this page open and run scenario 1 in a second browser or a private window. The page reloads itself every 30 seconds, and Dante Ruiz appears.`,
          `Go back to the list and tap Pop-up Meetup.`,
        ],
        see: [
          `In the list, Pop-up Meetup is flagged "No attendance group: check-in won't work for this event."`,
          `On Social Night's page, "Nobody has checked in yet." until someone does, then a count and the names, sorted.`,
          `On Pop-up Meetup's page, no QR code: "This event has no attendance group, so check-in can't record anyone and there is no QR code."`,
        ],
      },
    ],
    alreadyRun: `The list already has everyone who has checked in so far, and the count includes them.`,
  },
  {
    number: 8,
    title: "Volunteer staff check-in",
    parts: [
      {
        memberId: "c_pat",
        memberName: "Pat Rivera",
        target: { kind: "staff", eventId: SOCIAL_NIGHT },
        steps: [
          `Staff check-in for Social Night opens. Type Jordan in "Find a member" and tap "Search".`,
          `Tap Jordan Park. The check-in button is labeled with the name; tap it.`,
          `Tap "Next member", search for Lee, and tap Lee Hart.`,
        ],
        see: [
          `For Jordan Park, the name, 1 point and "Can check in."`,
          `After the tap, "Checked in." and +1 point.`,
          `For Lee Hart: "${VOLUNTEER_GENERIC_REFUSAL}" Nothing else: a volunteer never sees why.`,
        ],
        searches: [
          { term: "Jordan", memberId: "c_jordan" },
          { term: "Lee", memberId: "c_lee" },
        ],
      },
    ],
    alreadyRun: `Jordan shows "Already checked in." and no button. Lee's line is the same. Jordan will also appear in scenario 7's list.`,
  },
  {
    number: 9,
    title: "Admin and volunteer views compared",
    parts: [
      {
        memberId: "c_casey",
        memberName: "Casey Moreno",
        target: { kind: "staff", eventId: SOCIAL_NIGHT },
        steps: [
          `Staff check-in for Social Night opens. Search for Lee and tap Lee Hart.`,
          `Tap "Search again", search for Kai and tap Kai Mercer.`,
          `Compare with Lee in scenario 8, where Pat saw only the generic line. Neither search changes anything.`,
        ],
        see: [
          `For Lee Hart: "No current membership (none, or past the grace period). Ask them to renew in TidyHQ."`,
          `For Kai Mercer: the same line, and a boxed warning that the membership "is marked expired but its end date is in the future (or missing)".`,
        ],
        searches: [
          { term: "Lee", memberId: "c_lee" },
          { term: "Kai", memberId: "c_kai" },
        ],
      },
    ],
    alreadyRun: `The same for everyone, since neither member can check in.`,
  },
];
