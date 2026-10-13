"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { secureCookieOptions } from "@/lib/auth/cookieOptions";
import { getSession, setSession } from "@/lib/auth/session";
import {
  AWARD_NOTICE_COOKIE,
  AWARD_NOTICE_MAX_AGE_SECONDS,
  encodeAwardNotice,
} from "@/lib/checkin/awardNotice";
import { checkIn } from "@/lib/checkin/checkIn";
import { getTidyClient } from "@/lib/tidyhq";
import { checkinPath, resultPath, signInPath } from "./screens";

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

  const { contactId } = session;
  const result = await checkIn(getTidyClient(), {
    eventId,
    contactId,
    now: new Date(),
  });
  // The session is valid but TidyHQ no longer has the contact; signing in
  // again replaces it.
  if (result.status === "unknown_contact") redirect(signInPath(eventId));
  // Sliding expiry: members who keep coming are never signed out. Done here
  // because Server Components can't set cookies.
  if (result.status === "checked_in" || result.status === "already_checked_in") {
    await setSession(contactId);
  }
  // Tells the result page whether this tap awarded points. Any other outcome
  // clears an earlier tap's note, so it never says "+1" twice.
  const path = resultPath(eventId);
  if (result.status === "checked_in") {
    (await cookies()).set(
      AWARD_NOTICE_COOKIE,
      encodeAwardNotice({ eventId, contactId, points: result.pointsAwarded }),
      { ...secureCookieOptions(), path, maxAge: AWARD_NOTICE_MAX_AGE_SECONDS },
    );
  } else {
    (await cookies()).delete({ name: AWARD_NOTICE_COOKIE, path });
  }
  // The check-in page shows the unknown-event screen.
  if (result.status === "unknown_event") redirect(page);
  redirect(path);
}
