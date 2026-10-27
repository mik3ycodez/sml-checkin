import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getTidyClient } from "@/lib/tidyhq";
import { signInPath } from "../../memberPaths";
import { lookupContact } from "../lookupContact";
import {
  deniedReason,
  deniedRetryPath,
  deniedSignInReturn,
  staffCheckinEventId,
} from "../paths";
import { AdminDeniedScreen } from "../screens";

// Where `requireAdmin` sends anyone it turns away. Rendered fully on the
// server with no Suspense boundary or loading file (see
// .claude/rules/app-pages.md). The `reason` query only picks the wording; it
// grants nothing.

export default async function AdminDeniedPage({
  searchParams,
}: PageProps<"/admin/denied">) {
  const { reason, returnTo } = await searchParams;
  // Signing in again lands back on the staff check-in page for a volunteer
  // turned away from it, not on /admin.
  const signIn = signInPath(deniedSignInReturn(returnTo));
  const session = await getSession();
  if (!session) redirect(signIn);

  const contact = await lookupContact(getTidyClient(), session.contactId);
  if (contact.status === "unknown") redirect(signIn);

  return (
    <AdminDeniedScreen
      reason={deniedReason(reason)}
      retryPath={deniedRetryPath(returnTo)}
      staffEventId={staffCheckinEventId(returnTo)}
    />
  );
}
