import { Suspense } from "react";
import { CheckinProblem, Loading } from "../screens";

// Where the check-in button lands if TidyHQ failed partway. The failure is
// already in the server log; this only reads the event id from the URL, so
// it works even while TidyHQ is down.

export default function CheckInProblemPage({
  params,
}: PageProps<"/checkin/[eventId]/problem">) {
  return (
    <Suspense fallback={<Loading />}>
      <Problem params={params} />
    </Suspense>
  );
}

async function Problem({
  params,
}: Pick<PageProps<"/checkin/[eventId]/problem">, "params">) {
  const { eventId } = await params;
  return <CheckinProblem eventId={eventId} />;
}
