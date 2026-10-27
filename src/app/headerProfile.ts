import { headers } from "next/headers";
import { safeReturnTo } from "@/lib/auth/returnTo";
import { ADMIN_DENIED_PATH, staffCheckinEventId } from "./admin/paths";
import { checkinPath } from "./memberPaths";
import type { Profile } from "@/lib/auth/profile";
import { getSession } from "@/lib/auth/session";

/**
 * Where Sign out lands the next person on a shared phone. Any check-in screen
 * (`/checkin/<id>/...`, including problem and result pages that show one
 * member's outcome, the staff check-in page, and the denied page that turned
 * someone away from it) returns to that event's member check-in. Everywhere
 * else stays on the current page.
 */
function signOutReturn(path: string): string {
  const [pathname, query = ""] = path.split("?");
  const member = /^\/checkin\/([^/]+)\/.+$/.exec(pathname)?.[1];
  const staffId =
    staffCheckinEventId(pathname) ??
    (pathname === ADMIN_DENIED_PATH
      ? staffCheckinEventId(new URLSearchParams(query).get("returnTo"))
      : null);
  if (staffId !== null) return checkinPath(staffId);
  if (member) {
    try {
      return checkinPath(decodeURIComponent(member));
    } catch {
      return path;
    }
  }
  return path;
}

/**
 * What the layout's header needs: the member's display fields from the session
 * cookie (null when signed out), the page Sign out should return to
 * (`x-sml-path`, set by `src/proxy.ts`), and the exact current page for the
 * theme switch, which changes no one and so never needs Sign out's rule.
 * Fails soft: if the cookie can't be read (a bad or missing `SESSION_SECRET`
 * on a misconfigured dev server) the header shows signed out rather than
 * breaking every page. Nothing is logged: the error could carry anything.
 */
export async function loadHeaderProfile(): Promise<{
  profile: Profile | null;
  returnTo: string;
  pagePath: string;
}> {
  let pagePath = "/";
  let returnTo = "/";
  try {
    pagePath = safeReturnTo((await headers()).get("x-sml-path"));
    returnTo = signOutReturn(pagePath);
  } catch {
    // Outside a request: home.
  }
  try {
    const session = await getSession();
    if (!session) return { profile: null, returnTo, pagePath };
    const { name, initials, photo } = session;
    return { profile: { name, initials, photo }, returnTo, pagePath };
  } catch {
    return { profile: null, returnTo, pagePath };
  }
}
