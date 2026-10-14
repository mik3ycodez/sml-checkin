import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import {
  assessCheckIn,
  findEvent,
  type CheckInAssessment,
} from "@/lib/checkin/checkIn";
import { getTidyClient } from "@/lib/tidyhq";
import { signInPath } from "./screens";

/**
 * The signed-in member's status at an event, for the check-in and result
 * pages. Sends members without a usable session to sign in, except for an
 * unknown event: a bad QR code never goes through TidyHQ sign-in first.
 */
export async function memberStatus(eventId: string): Promise<
  | { contactId: null; status: { status: "unknown_event" } }
  | {
      contactId: string;
      status: Exclude<CheckInAssessment, { status: "unknown_contact" }>;
    }
> {
  const client = getTidyClient();
  const session = await getSession();
  if (!session) {
    if (!(await findEvent(client, eventId))) {
      return { contactId: null, status: { status: "unknown_event" } };
    }
    redirect(signInPath(eventId));
  }

  const { contactId } = session;
  const status = await assessCheckIn(client, {
    eventId,
    contactId,
    now: new Date(),
  });
  // The session is valid but TidyHQ no longer has the contact; signing in
  // again replaces it.
  if (status.status === "unknown_contact") redirect(signInPath(eventId));
  return { contactId, status };
}
