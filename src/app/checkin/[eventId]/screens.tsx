// Shared pieces of the check-in pages. PR 7 replaces the plain unknown-event
// text with a friendlier screen.

export function checkinPath(eventId: string): string {
  return `/checkin/${encodeURIComponent(eventId)}`;
}

export function signInPath(eventId: string): string {
  return `/auth/signin?returnTo=${encodeURIComponent(checkinPath(eventId))}`;
}

export function UnknownEvent() {
  return (
    <div className="flex flex-1 flex-col justify-center gap-4">
      <h1 className="text-2xl font-bold tracking-tight">
        We couldn&apos;t find that event
      </h1>
      <p className="text-lg text-foreground/70">
        Check the QR code, or ask a volunteer at the door.
      </p>
    </div>
  );
}

/** The event's name, or a stand-in if TidyHQ has none. */
export function eventTitle(name: string | null): string {
  return name ?? "SML event";
}

export function resultPath(eventId: string): string {
  return `${checkinPath(eventId)}/result`;
}

/**
 * Who's signed in, with a way to switch members on a shared phone. A plain
 * form post (sign-out refuses GETs), returning to this event's check-in page,
 * which sends the next member straight to sign-in.
 */
export function SignedInAs({
  name,
  eventId,
}: {
  name: string;
  eventId: string;
}) {
  return (
    <form method="post" action="/auth/signout" className="text-foreground/70">
      <input type="hidden" name="returnTo" value={checkinPath(eventId)} />
      Signed in as {name}.{" "}
      <span className="whitespace-nowrap">
        Not you?{" "}
        <button type="submit" className="underline">
          Sign out
        </button>
      </span>
    </form>
  );
}

export function Loading() {
  return <p className="text-lg text-foreground/70">Loading…</p>;
}
