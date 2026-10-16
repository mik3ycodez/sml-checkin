import { getAdminEvents } from "@/lib/admin/events";
import { getTidyClient } from "@/lib/tidyhq";
import { requireAdmin } from "./requireAdmin";
import { ADMIN_PATH } from "./paths";
import { AdminHomeScreen } from "./screens";

// The admin home page: the event list. Rendered fully on the server with no
// Suspense boundary or loading file (see CLAUDE.md), like the member pages.
// requireAdmin comes first and stops the request for anyone but an admin.
// A failed events read only affects the list, as on `/me`.

export default async function AdminPage() {
  const admin = await requireAdmin(ADMIN_PATH);
  let events = null;
  try {
    events = await getAdminEvents(getTidyClient(), { now: new Date() });
  } catch (error) {
    // Name only, like adminAccess: never a message that could carry a token.
    console.error(
      "Admin event list failed:",
      error instanceof Error ? error.name : "unknown error",
    );
  }
  return <AdminHomeScreen name={admin.name} events={events} />;
}
