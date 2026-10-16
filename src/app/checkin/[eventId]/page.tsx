import { checkInAction } from "./actions";
import { memberStatus } from "./memberStatus";
import { MemberFooter } from "../../memberUi";
import { eventTitle, StatusScreen } from "./screens";

// The page a member's phone opens from the event QR code. Visiting it changes
// nothing: checking in is a POST from the button, so link previews and
// prefetching can't check anyone in. A member who's already checked in, or
// can't check in (expired, not open yet), sees why instead of the button.

export default async function CheckInPage({
  params,
}: PageProps<"/checkin/[eventId]">) {
  const { eventId } = await params;
  const { status } = await memberStatus(eventId);
  if (status.status !== "ready") {
    return <StatusScreen status={status} eventId={eventId} notice={null} />;
  }

  // Plain forms, so checking in works even if JavaScript fails on older phones.
  return (
    <div className="flex flex-1 flex-col justify-center gap-6">
      <h1 className="text-3xl font-bold tracking-tight">
        {eventTitle(status.eventName)}
      </h1>
      <form action={checkInAction.bind(null, eventId)}>
        <button
          type="submit"
          className="bg-foreground text-background w-full rounded-lg px-4 py-5 text-2xl font-semibold"
        >
          Check in
        </button>
      </form>
      <MemberFooter eventId={eventId} name={status.name} />
    </div>
  );
}
