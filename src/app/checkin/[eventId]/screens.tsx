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

export function Loading() {
  return <p className="text-lg text-foreground/70">Loading…</p>;
}
