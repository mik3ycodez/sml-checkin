import { cookies } from "next/headers";
import { assessCheckInFor } from "@/lib/checkin/checkIn";
import { staffEventState } from "@/lib/checkin/staffEvent";
import { membershipWarnings, staffVerdict } from "@/lib/checkin/staffVerdict";
import { readTapNotice, STAFF_NOTICE_COOKIE } from "@/lib/checkin/tapNotice";
import type { CheckinBlocker } from "@/lib/tidyhq/checkinWindow";
import { getTidyClient } from "@/lib/tidyhq";
import { CHECKIN_BUDGET_MS, withBudget } from "@/lib/tidyhq/budget";
import { contactName } from "@/lib/tidyhq/contactName";
import { searchMembers } from "@/lib/tidyhq/contacts";
import { loadOrNull } from "../../../../loadOrNull";
import { requireVolunteer } from "../../../../requireVolunteer";
import {
  adminEventPath,
  staffCheckinPath,
  staffMemberPath,
} from "../../../paths";
import {
  backToCheckin,
  StaffNotice,
  StaffSearchScreen,
  StaffVerdictScreen,
  VolunteerModeEnded,
} from "./screens";

// Staff check-in: search by name, see a verdict, confirm. Rendered fully on
// the server with no Suspense boundary or loading file (see
// .claude/rules/app-pages.md), and with no auto-refresh. Every step is a GET
// (`?q=`, `?member=`) or the confirm's POST. requireVolunteer comes first and
// stops the request for anyone but a volunteer or an admin. Volunteers lose
// the page once check-in has ended; being on this URL is volunteer mode
// (there's no cookie).
//
// TidyHQ failures show a notice with a retry, not the error page. Bugs in our
// own code still reach it.

const NEVER_RUNS: Record<CheckinBlocker, string> = {
  archived:
    "This event is archived in TidyHQ. Unarchive it there if it's still running.",
  not_accepted: "This event doesn't take check-ins.",
  no_group:
    "This event has no attendance group in TidyHQ, so check-ins couldn't be recorded.",
  never_opens:
    "Its check-in window and its own start and end times are both unusable. Fix them in TidyHQ.",
};

function UnknownEvent({ eventId }: { eventId: string }) {
  return (
    <StaffNotice
      heading="We couldn't find that event"
      {...backToCheckin(eventId)}
    >
      TidyHQ has no event with that link.
    </StaffNotice>
  );
}

const first = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : "";

// The route limit for this page and the check-in action its form posts to
// (an action takes its page's limit). A check-in's time budget is sized for it:
// `ROUTE_MAX_DURATION_SECONDS` in `lib/tidyhq/budget.ts`, kept equal by a test.
export const maxDuration = 30;

// The render has the same time budget, the access check included, so a slow
// TidyHQ shows the notices below before the platform's own 504 can.
export default async function StaffCheckInPage({
  params,
  searchParams,
}: PageProps<"/admin/events/[eventId]/checkin">) {
  const { eventId } = await params;
  const query = await searchParams;
  return withBudget(CHECKIN_BUDGET_MS, () =>
    renderStaffCheckIn(eventId, query),
  );
}

async function renderStaffCheckIn(
  eventId: string,
  query: Record<string, string | string[] | undefined>,
) {
  const here = staffCheckinPath(eventId);
  const staff = await requireVolunteer(here);
  const client = getTidyClient();
  const now = new Date();

  const state = await loadOrNull("staff check-in event", () =>
    staffEventState(client, eventId, now),
  );
  if (!state) {
    return (
      <StaffNotice
        heading="This event is temporarily unavailable"
        linkHref={here}
        linkLabel="Try again"
      >
        TidyHQ isn&apos;t answering right now.
      </StaffNotice>
    );
  }
  if (state.status === "unknown_event") {
    return <UnknownEvent eventId={eventId} />;
  }
  if (state.status === "ended" && staff.role === "volunteer") {
    return <VolunteerModeEnded eventId={eventId} reason={state.reason} />;
  }
  // An admin is only stopped for an event check-in can never run for; for one
  // that has merely closed they still see each member's verdict.
  if (state.status === "ended" && state.reason !== "closed") {
    return (
      <StaffNotice
        heading="Check-in can't run for this event"
        linkHref={adminEventPath(eventId)}
        linkLabel="Event page"
      >
        {NEVER_RUNS[state.reason]}
      </StaffNotice>
    );
  }
  if (!state.loaded) return <UnknownEvent eventId={eventId} />;
  const { loaded } = state;
  const frame = { eventId, eventName: state.eventName, staff };

  const q = first(query.q);
  const memberId = first(query.member);
  if (memberId) {
    const found = await loadOrNull("staff check-in member", () =>
      assessCheckInFor(client, { contactId: memberId, now, ...loaded }),
    );
    if (!found) {
      return (
        <StaffNotice
          heading="We couldn't reach TidyHQ"
          linkHref={staffMemberPath(eventId, memberId, { q })}
          linkLabel="Try again"
        >
          Nothing was changed.
        </StaffNotice>
      );
    }
    if (found.status === "unknown_event") {
      return <UnknownEvent eventId={eventId} />;
    }
    if (found.status !== "unknown_contact") {
      const verdict = staffVerdict(found, staff.role, now);
      const notice =
        found.status === "already_checked_in"
          ? readTapNotice((await cookies()).get(STAFF_NOTICE_COOKIE)?.value, {
              eventId,
              contactId: memberId,
            })
          : null;
      // Admins also see why a membership record looks wrong. A failed read
      // only leaves the warnings out; it never hides the verdict.
      const memberships =
        staff.role === "admin"
          ? ((await loadOrNull("staff check-in memberships", () =>
              client.getMemberships(memberId),
            )) ?? [])
          : [];
      return (
        <StaffVerdictScreen
          {...frame}
          verdict={verdict}
          notice={notice}
          warnings={membershipWarnings(memberships, now)}
          nothingSaved={first(query.problem) === "nothing_saved"}
          memberId={memberId}
          query={q}
        />
      );
    }
    // An unknown member falls through to the search, as a bad link would.
  }

  if (!q) {
    return (
      <StaffSearchScreen {...frame} query="" search={{ status: "none" }} />
    );
  }
  const found = await loadOrNull("staff check-in search", () =>
    searchMembers(client, q),
  );
  if (!found) {
    return (
      <StaffSearchScreen
        {...frame}
        query={q}
        search={{ status: "unavailable" }}
      />
    );
  }
  return (
    <StaffSearchScreen
      {...frame}
      query={q}
      search={
        found.status === "ok"
          ? {
              status: "ok",
              members: found.contacts.map((c) => ({
                id: c.id,
                name: contactName(c),
              })),
            }
          : { status: found.status }
      }
    />
  );
}
