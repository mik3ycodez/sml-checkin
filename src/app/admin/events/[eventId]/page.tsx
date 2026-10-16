import { headers } from "next/headers";
import { getAdminEventPage } from "@/lib/admin/eventPage";
import { qrSvg } from "@/lib/admin/qr";
import { appOrigin } from "@/lib/auth/requestOrigin";
import { getTidyClient } from "@/lib/tidyhq";
import { requireAdmin } from "../../requireAdmin";
import { adminEventPath } from "../../paths";
import { AdminEventScreen, UnknownAdminEvent } from "./eventScreens";

// One event's admin page: its check-in window (with warnings) and the QR code
// members scan. Rendered fully on the server with no Suspense boundary or
// loading file (see CLAUDE.md). requireAdmin comes first, before anything is
// read from TidyHQ, and stops the request for anyone but an admin. A TidyHQ
// failure reaches the admin error page: without the event there's nothing
// useful to show.

export default async function AdminEventRoute({
  params,
}: PageProps<"/admin/events/[eventId]">) {
  const { eventId } = await params;
  const admin = await requireAdmin(adminEventPath(eventId));
  const event = await getAdminEventPage(getTidyClient(), eventId, {
    origin: appOrigin(await headers()),
    now: new Date(),
  });
  if (!event) return <UnknownAdminEvent name={admin.name} />;
  const svg = event.qr.kind === "qr" ? await qrSvg(event.qr.url) : null;
  return <AdminEventScreen name={admin.name} event={event} qrSvg={svg} />;
}
