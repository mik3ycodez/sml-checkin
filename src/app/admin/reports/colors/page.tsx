import { loadOrNull } from "@/app/loadOrNull";
import { getColorsOwed } from "@/lib/admin/colorsOwed";
import { getTidyClient } from "@/lib/tidyhq";
import { requireAdmin } from "../../requireAdmin";
import { COLORS_REPORT_PATH } from "../../paths";
import { ColorsReportScreen } from "./screens";

// The club colors owed report: admins only (volunteers are not let in).
// Read-only. Rendered fully on the server with no Suspense boundary or
// loading file (see CLAUDE.md). requireAdmin comes first. A TidyHQ failure
// shows "temporarily unavailable" with a retry link, never a partial list.

export default async function ColorsReportPage() {
  const admin = await requireAdmin(COLORS_REPORT_PATH);
  const report = await loadOrNull("Couldn't load the colors owed report", () =>
    getColorsOwed(getTidyClient(), { now: new Date() }),
  );
  return <ColorsReportScreen report={report} name={admin.name} />;
}
