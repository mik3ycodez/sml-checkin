import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getTidyClient } from "@/lib/tidyhq";
import { signInPath } from "../../memberPaths";
import { lookupContact } from "../lookupContact";
import { ADMIN_PATH, deniedReason } from "../paths";
import { AdminDeniedScreen } from "../screens";

// Where `requireAdmin` sends anyone it turns away. Rendered fully on the
// server with no Suspense boundary or loading file (see CLAUDE.md). The
// `reason` query only picks the wording; it grants nothing.

export default async function AdminDeniedPage({
  searchParams,
}: PageProps<"/admin/denied">) {
  const session = await getSession();
  if (!session) redirect(signInPath(ADMIN_PATH));

  const { reason } = await searchParams;
  const contact = await lookupContact(getTidyClient(), session.contactId);
  if (contact.status === "unknown") redirect(signInPath(ADMIN_PATH));

  return (
    <AdminDeniedScreen
      reason={deniedReason(reason)}
      name={contact.status === "known" ? contact.name : null}
    />
  );
}
