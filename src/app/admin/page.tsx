import { requireAdmin } from "./requireAdmin";
import { ADMIN_PATH } from "./paths";
import { AdminHomeScreen } from "./screens";

// The admin home page. Rendered fully on the server with no Suspense boundary
// or loading file (see CLAUDE.md), like the member pages. The event list
// arrives in the next PR.

export default async function AdminPage() {
  const admin = await requireAdmin(ADMIN_PATH);
  return <AdminHomeScreen name={admin.name} />;
}
