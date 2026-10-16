import { cookies } from "next/headers";
import { assessCheckIn } from "@/lib/checkin/checkIn";
import { staffEventState } from "@/lib/checkin/staffEvent";
import { membershipWarnings, staffVerdict } from "@/lib/checkin/staffVerdict";
import { readTapNotice, STAFF_NOTICE_COOKIE } from "@/lib/checkin/tapNotice";
import { getTidyClient } from "@/lib/tidyhq";
import { contactName } from "@/lib/tidyhq/contactName";
import { searchMembers } from "@/lib/tidyhq/contacts";
import { loadOrNull } from "../../../../loadOrNull";
import { requireVolunteer } from "../../../../requireVolunteer";
import { staffCheckinPath } from "../../../paths";
import {
  backToCheckin,
  StaffNotice,
  StaffSearchScreen,
  StaffVerdictScreen,
} from "./screens";

// Staff check-in: search by name, see a verdict, confirm. Rendered fully on
// the server with no Suspense boundary or loading file (see CLAUDE.md), and
// with no auto-refresh. Every step is a GET (`?q=`, `?member=`) or the
// confirm's POST. requireVolunteer comes first and stops the request for
// anyone but a volunteer or an admin. Volunteers lose the page once check-in
// has ended; being on this URL is volunteer mode (there's no cookie).
//
// TidyHQ failures show a notice with a retry, not the error page. Bugs in our
// own code still reach it.

const first = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : "";

export default async function StaffCheckInPage({
  params,
  searchParams,
}: PageProps<"/admin/events/[eventId]/checkin">) {
  const { eventId } = await params;
  const query = await searchParams;
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
    return (
      <StaffNotice
        heading="We couldn't find that event"
        {...backToCheckin(eventId)}
      >
        TidyHQ has no event with that link.
      </StaffNotice>
    );
  }
  if (state.status === "ended" && staff.role === "volunteer") {
    return (
      <StaffNotice heading="Check-in has closed" {...backToCheckin(eventId)}>
        Check-in for this event has closed, so staff check-in is over.
      </StaffNotice>
    );
  }
  const frame = { eventId, eventName: state.eventName, staff };

  const q = first(query.q);
  const memberId = first(query.member);
  if (memberId) {
    const loaded = await loadOrNull("staff check-in member", async () => {
      const assessment = await assessCheckIn(client, {
        eventId,
        contactId: memberId,
        now,
      });
      // Admins also see why a membership record looks wrong.
      const memberships =
        staff.role === "admin" && "name" in assessment
          ? await client.getMemberships(memberId)
          : [];
      return { assessment, memberships };
    });
    if (!loaded) {
      return (
        <StaffNotice
          heading="We couldn't reach TidyHQ"
          linkHref={`${here}?member=${encodeURIComponent(memberId)}`}
          linkLabel="Try again"
        >
          Nothing was changed.
        </StaffNotice>
      );
    }
    const { assessment } = loaded;
    if (
      assessment.status !== "unknown_event" &&
      assessment.status !== "unknown_contact"
    ) {
      const verdict = staffVerdict(assessment, staff.role);
      const notice =
        assessment.status === "already_checked_in"
          ? readTapNotice((await cookies()).get(STAFF_NOTICE_COOKIE)?.value, {
              eventId,
              contactId: memberId,
            })
          : null;
      return (
        <StaffVerdictScreen
          {...frame}
          verdict={verdict}
          notice={notice}
          warnings={membershipWarnings(loaded.memberships, now)}
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
