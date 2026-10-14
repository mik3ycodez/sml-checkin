import { CheckinProblem } from "../screens";

// Where the check-in button lands if TidyHQ failed partway. The failure is
// already in the server log; this only reads the event id from the URL, so
// it works even while TidyHQ is down.

// Rendered per request, never at build time, even if a later edit stops
// reading request data here.
export const dynamic = "force-dynamic";

export default async function CheckInProblemPage({
  params,
}: PageProps<"/checkin/[eventId]/problem">) {
  const { eventId } = await params;
  return <CheckinProblem eventId={eventId} />;
}
