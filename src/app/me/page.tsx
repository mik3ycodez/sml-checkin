import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getMemberSummary } from "@/lib/member/memberSummary";
import { getTidyClient } from "@/lib/tidyhq";
import { loadRecentEvents } from "./loadRecentEvents";
import { ME_PATH, MeScreen } from "./screens";

// The member status page. Read-only. Rendered fully on the server with no
// Suspense boundary or loading file (see CLAUDE.md): with JavaScript off, streamed
// content would never appear. The summary and the recent events are read
// together, and a failed events read only affects its own section.

const SIGN_IN = `/auth/signin?returnTo=${encodeURIComponent(ME_PATH)}`;

export default async function MePage() {
  const session = await getSession();
  if (!session) redirect(SIGN_IN);

  const client = getTidyClient();
  const now = new Date();
  const { contactId } = session;
  const [summary, recentEvents] = await Promise.all([
    getMemberSummary(client, { contactId, now }),
    loadRecentEvents(client, { contactId, now }),
  ]);
  // The session is valid but TidyHQ no longer has the contact; signing in
  // again replaces it.
  if (summary.status === "unknown_contact") redirect(SIGN_IN);

  return <MeScreen summary={summary} recentEvents={recentEvents} now={now} />;
}
