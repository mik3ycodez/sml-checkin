import { getTidyClient } from "@/lib/tidyhq";
import { loadAdminEvents } from "./loadAdminEvents";
import { requireAdmin } from "./requireAdmin";
import { ADMIN_PATH } from "./paths";
import { AdminHomeScreen } from "./screens";

// The admin home page: the event list. Rendered fully on the server with no
// Suspense boundary or loading file (see CLAUDE.md), like the member pages.
// requireAdmin comes first and stops the request for anyone but an admin.
// A TidyHQ failure only affects the list, as on `/me`.

export default async function AdminPage() {
  const admin = await requireAdmin(ADMIN_PATH);
  const events = await loadAdminEvents(getTidyClient(), { now: new Date() });
  return <AdminHomeScreen name={admin.name} events={events} />;
}
