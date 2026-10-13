import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AWARD_NOTICE_COOKIE, readAwardNotice } from "@/lib/checkin/awardNotice";
import { memberStatus } from "../memberStatus";
import { checkinPath, Loading, StatusScreen } from "../screens";

// Where the check-in button lands. Whether the member is checked in (and if
// not, why), and their total, are re-read from TidyHQ rather than taken from
// the URL, so a refresh shows the truth. Only "+N points" comes from the
// action, via a short-lived cookie, because TidyHQ can't say whether this tap
// awarded it.

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

  const awarded =
    contactId === null
      ? null
      : readAwardNotice((await cookies()).get(AWARD_NOTICE_COOKIE)?.value, {
          eventId,
          contactId,
        });
  return <StatusScreen status={status} eventId={eventId} awarded={awarded} />;
}
