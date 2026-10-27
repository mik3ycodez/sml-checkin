import { headers } from "next/headers";
import { safeReturnTo } from "@/lib/auth/returnTo";
import { staffCheckinEventId } from "./admin/paths";
import { checkinPath } from "./memberPaths";
import type { Profile } from "@/lib/auth/profile";
import { getSession } from "@/lib/auth/session";

/**
 * What the layout's header needs: the member's display fields from the session
 * cookie (null when signed out), and the page Sign out should return to
 * (`x-sml-path`, set by `src/proxy.ts`). Fails soft: if the cookie can't be
 * read (a bad or missing `SESSION_SECRET` on a misconfigured dev server) the
 * header shows signed out rather than breaking every page. Nothing is logged:
 * the error could carry anything.
 */
export async function loadHeaderProfile(): Promise<{
  profile: Profile | null;
  returnTo: string;
}> {
  let returnTo = "/";
  try {
    const path = safeReturnTo((await headers()).get("x-sml-path"));
    // Signing out of staff mode lands the next member on the member page.
    const staffEventId = staffCheckinEventId(path.split("?")[0]);
    returnTo = staffEventId === null ? path : checkinPath(staffEventId);
  } catch {
    // Outside a request: home.
  }
  try {
    const session = await getSession();
    if (!session) return { profile: null, returnTo };
    const { name, initials, photo } = session;
    return { profile: { name, initials, photo }, returnTo };
  } catch {
    return { profile: null, returnTo };
  }
}
