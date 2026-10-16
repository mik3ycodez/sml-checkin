/** The member status page. */
export const ME_PATH = "/me";

/** Starts TidyHQ sign-in, then returns the member to `returnTo`. */
export function signInPath(returnTo: string): string {
  return `/auth/signin?returnTo=${encodeURIComponent(returnTo)}`;
}

export { checkinPath } from "@/lib/checkin/paths";
