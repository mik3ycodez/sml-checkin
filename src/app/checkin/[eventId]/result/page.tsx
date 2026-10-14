import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { readTapNotice, TAP_NOTICE_COOKIE } from "@/lib/checkin/tapNotice";
import { memberStatus } from "../memberStatus";
import { checkinPath, Loading, StatusScreen } from "../screens";

// Where the check-in button lands. Whether the member is checked in (and if
// not, why), and their total, are re-read from TidyHQ rather than taken from
// the URL, so a refresh shows the truth. Only what this tap did ("+N points",
// a repeat, or a point that didn't save) comes from the action, via a
// short-lived cookie, because TidyHQ can't say.

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
  const { contactId, status } = await memberStatus(eventId);
  // Not checked in, but could be (e.g. the URL was opened directly): the
  // check-in page has the button.
  if (status.status === "ready") redirect(checkinPath(eventId));

  const notice =
    contactId === null
      ? null
      : readTapNotice((await cookies()).get(TAP_NOTICE_COOKIE)?.value, {
          eventId,
          contactId,
        });
  return <StatusScreen status={status} eventId={eventId} notice={notice} />;
}
