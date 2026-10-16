/** The member status page. */
export const ME_PATH = "/me";

/** Starts TidyHQ sign-in, then returns the member to `returnTo`. */
export function signInPath(returnTo: string): string {
  return `/auth/signin?returnTo=${encodeURIComponent(returnTo)}`;
}

/** The page a member's phone opens from an event's QR code. */
export function checkinPath(eventId: string): string {
  return `/checkin/${encodeURIComponent(eventId)}`;
}
