import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getSession } from "@/lib/auth/session";
import { AWARD_NOTICE_COOKIE, readAwardNotice } from "@/lib/checkin/awardNotice";
import { findEvent } from "@/lib/checkin/checkIn";
import { getCheckinStatus } from "@/lib/checkin/checkinStatus";
import { getTidyClient } from "@/lib/tidyhq";
import {
  checkinPath,
  eventTitle,
  Loading,
  SignedInAs,
  signInPath,
  UnknownEvent,
} from "../screens";

// Where the check-in button lands. Whether the member is checked in, and
// their total, are re-read from TidyHQ rather than taken from the URL, so a
// refresh shows the truth. Only "+N points" comes from the action, via a
// short-lived cookie, because TidyHQ can't say whether this tap awarded it.

export default function CheckInResultPage({
  params,
}: PageProps<"/checkin/[eventId]/result">) {
  return (
    <Suspense fallback={<Loading />}>
      <Result params={params} />
    </Suspense>
  );
}

async function Result({
  params,
}: Pick<PageProps<"/checkin/[eventId]/result">, "params">) {
  await connection();
  const { eventId } = await params;
  const client = getTidyClient();
  const session = await getSession();
  if (!session) {
    // Same order as the check-in page: a bad link never goes through sign-in.
    if (!(await findEvent(client, eventId))) return <UnknownEvent />;
    redirect(signInPath(eventId));
  }

  const { contactId } = session;
  const status = await getCheckinStatus(client, { eventId, contactId });
  if (status.status === "unknown_event") return <UnknownEvent />;
  if (status.status === "unknown_contact") redirect(signInPath(eventId));
  const signedInAs = <SignedInAs name={status.name} eventId={eventId} />;

  if (status.status === "not_checked_in") {
    // PR 7 explains why (membership expired, not open yet, and so on).
    return (
      <div className="flex flex-1 flex-col justify-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">
          You&apos;re not checked in
        </h1>
        <p className="text-lg text-foreground/70">
          Please ask a volunteer at the door for help.
        </p>
        <a
          href={checkinPath(eventId)}
          className="rounded-lg border border-foreground/20 px-4 py-3 text-center text-lg"
        >
          Back to check-in
        </a>
        {signedInAs}
      </div>
    );
  }

  const awarded = readAwardNotice(
    (await cookies()).get(AWARD_NOTICE_COOKIE)?.value,
    { eventId, contactId },
  );
  return (
    <div className="flex flex-1 flex-col justify-center gap-4">
      <p className="text-lg text-foreground/70">
        {eventTitle(status.eventName)}
      </p>
      <h1 className="text-3xl font-bold tracking-tight">
        You&apos;re checked in, {status.name}!
      </h1>
      {awarded !== null && (
        <p className="text-4xl font-bold">
          +{awarded} {awarded === 1 ? "point" : "points"}
        </p>
      )}
      {status.total !== null && (
        <p className="text-xl">
          Your total: <span className="font-semibold">{status.total}</span>
        </p>
      )}
      {signedInAs}
    </div>
  );
}
