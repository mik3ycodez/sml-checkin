"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { secureCookieOptions } from "@/lib/auth/cookieOptions";
import { getSession, setSession } from "@/lib/auth/session";
import {
  CheckInFailure,
  checkIn,
  type CheckInResult,
} from "@/lib/checkin/checkIn";
import type { MembershipNotice } from "@/lib/membership";
import { logCheckinFailure } from "@/lib/checkin/logFailure";
import {
  encodeTapNotice,
  TAP_NOTICE_COOKIE,
  TAP_NOTICE_MAX_AGE_SECONDS,
  type TapOutcome,
} from "@/lib/checkin/tapNotice";
import { getTidyClient } from "@/lib/tidyhq";
import { CHECKIN_BUDGET_MS, withBudget } from "@/lib/tidyhq/budget";
import { checkinPath } from "../../memberPaths";
import { problemPath, resultPath, signInPath } from "./screens";

/**
 * The check-in button. Bound to the event id on the check-in page; the
 * member comes from the session, never the form. Anyone can post here, so
 * the id is checked and the session verified again.
 *
 * Always redirects. The result page re-reads TidyHQ, so a refresh there
 * never posts again. If TidyHQ fails partway, the failure is logged and the
 * member sees a friendly screen rather than a crash.
 */
export async function checkInAction(eventId: unknown): Promise<never> {
  // One time budget for everything the tap does, so it ends before the
  // route's limit however slowly TidyHQ answers.
  return withBudget(CHECKIN_BUDGET_MS, () => runCheckInAction(eventId));
}

async function runCheckInAction(eventId: unknown): Promise<never> {
  if (typeof eventId !== "string" || eventId === "") redirect("/");
  const page = checkinPath(eventId);

  const session = await getSession();
  if (!session) redirect(signInPath(eventId));

  const { contactId } = session;
  let result:
    | CheckInResult
    | { status: "point_not_saved"; membershipNotice: MembershipNotice | null };
  try {
    result = await checkIn(getTidyClient(), {
      eventId,
      contactId,
      now: new Date(),
    });
  } catch (error) {
    if (!(error instanceof CheckInFailure)) throw error;
    logCheckinFailure({ eventId, contactId, failure: error });
    // Nothing was written (a write is never started without its full time),
    // so trying again is safe.
    if (error.step !== "points_write") redirect(problemPath(eventId));
    // In the group, the point unconfirmed. Trying again would only say "already
    // checked in", so the result page asks them to tell a Board member, who
    // checks the total in TidyHQ before adding anything (it may have landed).
    result = {
      status: "point_not_saved",
      membershipNotice: error.membershipNotice,
    };
  }
  // The session is valid but TidyHQ no longer has the contact; signing in
  // again replaces it.
  if (result.status === "unknown_contact") redirect(signInPath(eventId));

  // Tells the result page what this tap did. Any other outcome clears an
  // earlier tap's note, so it never says "+1" twice.
  const path = resultPath(eventId);
  const outcome = tapOutcome(result);
  if (outcome) {
    // Sliding expiry: members who keep coming are never signed out. Done
    // here because Server Components can't set cookies. The header profile
    // comes from the contact this check-in just read, so it refreshes with
    // every tap. Only a point_not_saved result has no fresh contact; it keeps
    // the session's own.
    await setSession(contactId, "profile" in result ? result.profile : session);
    (await cookies()).set(
      TAP_NOTICE_COOKIE,
      encodeTapNotice({ eventId, contactId, outcome }),
      { ...secureCookieOptions(), path, maxAge: TAP_NOTICE_MAX_AGE_SECONDS },
    );
  } else {
    (await cookies()).delete({ name: TAP_NOTICE_COOKIE, path });
  }
  // The check-in page shows the unknown-event screen.
  if (result.status === "unknown_event") redirect(page);
  redirect(path);
}

/** What a tap did for a member now in the group, or null if they aren't. */
function tapOutcome(
  result:
    | CheckInResult
    | { status: "point_not_saved"; membershipNotice: MembershipNotice | null },
): TapOutcome | null {
  switch (result.status) {
    case "checked_in":
      return {
        kind: "awarded",
        points: result.pointsAwarded,
        ...(result.membershipNotice && {
          membershipNotice: result.membershipNotice,
        }),
        ...(result.qualified.length > 0 && { qualified: result.qualified }),
      };
    case "already_checked_in":
      return { kind: "repeat" };
    case "point_not_saved":
      return {
        kind: "point_not_saved",
        ...(result.membershipNotice && {
          membershipNotice: result.membershipNotice,
        }),
      };
    default:
      return null;
  }
}
