import { headers } from "next/headers";
import {
  attendeeRefreshSeconds,
  getEventAttendees,
} from "@/lib/admin/attendees";
import { getAdminEventPage } from "@/lib/admin/eventPage";
import { qrSvg } from "@/lib/admin/qr";
import { appOrigin } from "@/lib/auth/requestOrigin";
import { getTidyClient } from "@/lib/tidyhq";
import { loadOrNull } from "../../../loadOrNull";
import { requireAdmin } from "../../requireAdmin";
import { adminEventPath } from "../../paths";
import { AdminEventScreen, UnknownAdminEvent } from "./eventScreens";

// One event's admin page: its check-in window (with warnings) and the QR code
// members scan. Rendered fully on the server with no Suspense boundary or
// loading file (see CLAUDE.md). requireAdmin comes first, before anything is
// read from TidyHQ, and stops the request for anyone but an admin, so only
// admins see who attended. A TidyHQ failure reading the event reaches the
// admin error page: without the event there's nothing useful to show. A
// failure reading the attendee list doesn't: that section says it couldn't
// load, and the QR code the door needs still shows. While check-in is open
// or about to open, the page reloads itself (a meta refresh, so no
// JavaScript); see `attendeeRefreshSeconds`.

export default async function AdminEventRoute({
  params,
}: PageProps<"/admin/events/[eventId]">) {
  const { eventId } = await params;
  const admin = await requireAdmin(adminEventPath(eventId));
  const client = getTidyClient();
  const now = new Date();
  const event = await getAdminEventPage(client, eventId, { now });
  if (!event) return <UnknownAdminEvent name={admin.name} />;
  // The lib returns the path; the site's origin is the page's to add.
  let qr: { url: string; svg: string } | null = null;
  if (event.qr.kind === "qr") {
    const url = `${appOrigin(await headers())}${event.qr.path}`;
    qr = { url, svg: await qrSvg(url) };
  }
  const attendees =
    (await loadOrNull("admin attendees", () =>
      getEventAttendees(client, eventId),
    )) ?? ("unavailable" as const);
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
