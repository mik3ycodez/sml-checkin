"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { secureCookieOptions } from "@/lib/auth/cookieOptions";
import {
  CheckInFailure,
  checkIn,
  type CheckInResult,
} from "@/lib/checkin/checkIn";
import { logCheckinFailure } from "@/lib/checkin/logFailure";
import {
  encodeTapNotice,
  STAFF_NOTICE_COOKIE,
  TAP_NOTICE_MAX_AGE_SECONDS,
  type TapOutcome,
} from "@/lib/checkin/tapNotice";
import { getTidyClient } from "@/lib/tidyhq";
import { requireVolunteer } from "../../../../requireVolunteer";
import { staffCheckinPath, staffMemberPath } from "../../../paths";

/**
 * The staff "Check in" button. Bound to the event id on the staff page; the
 * member to check in comes from the form. Who is doing it never does: the
 * guard says, and the note records it. Anyone can post here, so the guard
 * runs first, before anything else is read or written (a page check alone
 * doesn't protect an action), and the ids are checked.
 *
 * No separate check that the event is still running: `checkIn` refuses a
 * closed, archived or group-less event before writing anything, and the page
 * is what stops a volunteer seeing members after the event. Always
 * redirects, and the page re-reads TidyHQ, so a refresh never posts again.
 */
export async function staffCheckInAction(
  eventId: unknown,
  formData: FormData,
): Promise<never> {
  if (typeof eventId !== "string" || eventId === "") redirect("/");
  const page = staffCheckinPath(eventId);
  const staff = await requireVolunteer(page);

  const member = formData.get("member");
  if (typeof member !== "string" || member === "") redirect(page);

  const q = formData.get("q");
  // Only carried back to the page, which treats it as plain text.
  const search = typeof q === "string" ? q.slice(0, 100) : "";
  const client = getTidyClient();
  const now = new Date();

  let result: CheckInResult | { status: "point_not_saved" };
  try {
    result = await checkIn(client, {
      eventId,
      contactId: member,
      method: "staff",
      staff,
      now,
    });
  } catch (error) {
    if (!(error instanceof CheckInFailure)) throw error;
    logCheckinFailure({ eventId, contactId: member, failure: error });
    // Nothing was written, so trying again is safe.
    if (error.step !== "points_write") {
      redirect(
        staffMemberPath(eventId, member, {
          problem: "nothing_saved",
          q: search,
        }),
      );
    }
    // In the group without the point. Trying again would only say "already
    // checked in", so the page says to tell a Board member.
    result = { status: "point_not_saved" };
  }
  if (result.status === "unknown_contact") redirect(page);

  // Tells the page what this confirm did; any other outcome clears an
  // earlier one so it never says "+1" twice.
  const outcome = staffOutcome(result);
  if (outcome) {
    (await cookies()).set(
      STAFF_NOTICE_COOKIE,
      encodeTapNotice({ eventId, contactId: member, outcome }),
      {
        ...secureCookieOptions(),
        path: page,
        maxAge: TAP_NOTICE_MAX_AGE_SECONDS,
      },
    );
  } else {
    (await cookies()).delete({ name: STAFF_NOTICE_COOKIE, path: page });
  }
  redirect(staffMemberPath(eventId, member, { q: search }));
}

/**
 * What the confirm did for a member now in the group, or null. Carries no
 * membership notice or reward details: the page must not show them to
 * volunteers.
 */
function staffOutcome(
  result: CheckInResult | { status: "point_not_saved" },
): TapOutcome | null {
  switch (result.status) {
    case "checked_in":
      return { kind: "awarded", points: result.pointsAwarded };
    case "already_checked_in":
      return { kind: "repeat" };
    case "point_not_saved":
      return { kind: "point_not_saved" };
    default:
      return null;
  }
}
