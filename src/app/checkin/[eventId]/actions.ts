"use server";

import { redirect } from "next/navigation";
import { getSession, setSession } from "@/lib/auth/session";
import { checkIn } from "@/lib/checkin/checkIn";
import { getTidyClient } from "@/lib/tidyhq";
import { checkinPath, signInPath } from "./screens";

/**
 * The check-in button. Bound to the event id on the check-in page; the
 * member comes from the session, never the form. Anyone can post here, so
 * the id is checked and the session verified again.
 *
 * Always redirects. The result page re-reads TidyHQ, so a refresh there
 * never posts again.
 */
export async function checkInAction(eventId: unknown): Promise<never> {
  if (typeof eventId !== "string" || eventId === "") redirect("/");
  const page = checkinPath(eventId);

  const session = await getSession();
  if (!session) redirect(signInPath(eventId));

  const result = await checkIn(getTidyClient(), {
    eventId,
    contactId: session.contactId,
    now: new Date(),
  });
  // Sliding expiry: members who keep coming are never signed out. Done here
  // because Server Components can't set cookies.
  if (result.status === "checked_in" || result.status === "already_checked_in") {
    await setSession(session.contactId);
  }
  // The check-in page shows the unknown-event screen.
  if (result.status === "unknown_event") redirect(page);
  redirect(`${page}/result`);
}
