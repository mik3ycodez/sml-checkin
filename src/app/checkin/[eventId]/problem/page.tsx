import { CheckinProblem } from "../screens";

// Where the check-in button lands if TidyHQ failed partway. The failure is
// already in the server log; this only reads the event id from the URL, so
// it works even while TidyHQ is down.

export default async function CheckInProblemPage({
  params,
}: PageProps<"/checkin/[eventId]/problem">) {
  const { eventId } = await params;
  return <CheckinProblem eventId={eventId} />;
}
