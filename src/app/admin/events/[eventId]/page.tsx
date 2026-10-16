import { headers } from "next/headers";
import {
  attendeeRefreshSeconds,
  getEventAttendees,
} from "@/lib/admin/attendees";
import { getAdminEventPage } from "@/lib/admin/eventPage";
import { qrSvg } from "@/lib/admin/qr";
import { appOrigin } from "@/lib/auth/requestOrigin";
import { getTidyClient } from "@/lib/tidyhq";
import { findEventGroup } from "@/lib/tidyhq/eventGroups";
import { loadOrNull } from "../../../loadOrNull";
import { requireAdmin } from "../../requireAdmin";
import { adminEventPath } from "../../paths";
import {
  AdminEventScreen,
  AdminEventUnavailable,
  UnknownAdminEvent,
} from "./eventScreens";

// One event's admin page: its check-in window (with warnings), the QR code
// members scan, and who has checked in. Rendered fully on the server with no
// Suspense boundary or loading file (see CLAUDE.md). requireAdmin comes
// first, before anything is read from TidyHQ, and stops the request for
// anyone but an admin, so only admins see who attended.
//
// While check-in is open or about to open, the page reloads itself (a meta
// refresh, so no JavaScript; see `attendeeRefreshSeconds`), so a TidyHQ
// failure must never leave it on a screen that doesn't reload. A failure
// reading the event shows a "temporarily unavailable" notice that retries; a
// failure reading the attendee list says so in that section only, and the QR
// code the door needs still shows. requireAdmin's "couldn't check access"
// screen retries this page too (see `adminDeniedPath`). Only TidyHQ errors
// are treated this way; a bug in our own code still reaches the error page.

export default async function AdminEventRoute({
  params,
}: PageProps<"/admin/events/[eventId]">) {
  const { eventId } = await params;
  const admin = await requireAdmin(adminEventPath(eventId));
  const client = getTidyClient();
  const now = new Date();

  // Whether the event has an attendance group depends only on its id, so
  // that's decided once here and the attendee read goes out alongside the
  // event read instead of after it.
  const groupId = findEventGroup({ id: eventId });
  const [loaded, attendees] = await Promise.all([
    loadOrNull("admin event", async () => ({
      event: await getAdminEventPage(client, eventId, { now }),
    })),
    groupId === null
      ? null
      : loadOrNull("admin attendees", () =>
          getEventAttendees(client, groupId),
        ).then((people) => people ?? ("unavailable" as const)),
  ]);
  if (!loaded) {
    return <AdminEventUnavailable name={admin.name} eventId={eventId} />;
  }
  const { event } = loaded;
  if (!event) return <UnknownAdminEvent name={admin.name} />;

  // The lib returns the path; the site's origin is the page's to add.
  let qr: { url: string; svg: string } | null = null;
  if (event.qr.kind === "qr") {
    const url = `${appOrigin(await headers())}${event.qr.path}`;
    qr = { url, svg: await qrSvg(url) };
  }
  return (
    <AdminEventScreen
      name={admin.name}
      event={event}
      qr={qr}
      attendees={attendees}
      refreshSeconds={attendeeRefreshSeconds(event, now)}
    />
  );
}
