/**
 * The page a member's phone opens from an event's QR code. The id is encoded
 * so it can't alter the path. In `lib` so the admin logic can name the path
 * without depending on the route layer; `memberPaths.ts` re-exports it.
 */
export function checkinPath(eventId: string): string {
  return `/checkin/${encodeURIComponent(eventId)}`;
}

/** An event's admin page. The id is encoded so it can't alter the path. */
export function adminEventPath(eventId: string): string {
  return `/admin/events/${encodeURIComponent(eventId)}`;
}

/** An event's staff check-in page. The id is encoded so it can't alter the path. */
export function staffCheckinPath(eventId: string): string {
  return `${adminEventPath(eventId)}/checkin`;
}
