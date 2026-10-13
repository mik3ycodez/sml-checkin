import type { TidyClient } from "../tidyhq/client";
import { assessCheckIn, type CheckInRefusal } from "./checkIn";

export type CheckinStatus =
  | {
      status: "checked_in";
      name: string;
      eventName: string | null;
      /** Null if the stored total is unreadable. */
      total: number | null;
    }
  /** Not checked in yet, and the button would check them in. */
  | { status: "ready"; name: string; eventName: string | null }
  /** Not checked in, and why the button wouldn't work. */
  | CheckInRefusal;

/**
 * Whether a member is checked in to an event (with their stored points total),
 * and if not, whether they could check in now or why not, read fresh from
 * TidyHQ. Changes nothing. Uses the same rules as `checkIn`, so the pages can
 * explain a refusal before the tap, and the result page shows the truth on a
 * refresh rather than trusting the URL.
 */
export async function getCheckinStatus(
  client: TidyClient,
  input: { eventId: string; contactId: string; now: Date },
): Promise<CheckinStatus> {
  const assessment = await assessCheckIn(client, input);
  switch (assessment.status) {
    case "already_checked_in": {
      const { name, eventName, total } = assessment;
      return { status: "checked_in", name, eventName, total };
    }
    case "ready": {
      const { name, eventName } = assessment;
      return { status: "ready", name, eventName };
    }
    default:
      return assessment;
  }
}
