import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getSession } from "@/lib/auth/session";
import { getCheckinStatus } from "@/lib/checkin/checkinStatus";
import { POINTS_PER_CHECKIN } from "@/lib/points";
import { getTidyClient } from "@/lib/tidyhq";
import { checkinPath, Loading, signInPath, UnknownEvent } from "../screens";

// Where the check-in button lands. Everything shown is re-read from TidyHQ,
// not taken from the URL, so a refresh shows the truth and can't be faked.

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
  const session = await getSession();
  if (!session) redirect(signInPath(eventId));

  const status = await getCheckinStatus(getTidyClient(), {
    eventId,
    contactId: session.contactId,
  });
  if (status.status === "unknown_event") return <UnknownEvent />;

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
      </div>
    );
  }

  // The role isn't saved yet, so this shows the attendee award. Each member
  // earns it once per event, so it's true however many times they tapped.
  const points = POINTS_PER_CHECKIN.attendee;
  return (
    <div className="flex flex-1 flex-col justify-center gap-4">
      <p className="text-lg text-foreground/70">{status.eventName}</p>
      <h1 className="text-3xl font-bold tracking-tight">
        You&apos;re checked in, {status.name}!
      </h1>
      <p className="text-4xl font-bold">
        +{points} {points === 1 ? "point" : "points"}
      </p>
      {status.total !== null && (
        <p className="text-xl">
          Your total: <span className="font-semibold">{status.total}</span>
        </p>
      )}
    </div>
  );
}
