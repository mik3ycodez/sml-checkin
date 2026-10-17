import { CHECKIN_BUDGET_MS, withBudget } from "@/lib/tidyhq/budget";
import { checkInAction } from "./actions";
import { memberStatus } from "./memberStatus";
import { MemberFooter } from "../../memberUi";
import { eventTitle, StatusScreen } from "./screens";

// The page a member's phone opens from the event QR code. Visiting it changes
// nothing: checking in is a POST from the button, so link previews and
// prefetching can't check anyone in. A member who's already checked in, or
// can't check in (expired, not open yet), sees why instead of the button.

// The route limit for this page and the check-in action its form posts to
// (an action takes its page's limit). A check-in's time budget is sized for it:
// `ROUTE_MAX_DURATION_SECONDS` in `lib/tidyhq/budget.ts`, kept equal by a test.
export const maxDuration = 30;

// The render has the same time budget, so a slow TidyHQ ends in our own error
// screen (`error.tsx`) before the platform kills the function with its own 504.
export default async function CheckInPage({
  params,
}: PageProps<"/checkin/[eventId]">) {
  const { eventId } = await params;
  return withBudget(CHECKIN_BUDGET_MS, () => renderCheckIn(eventId));
}

async function renderCheckIn(eventId: string) {
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
