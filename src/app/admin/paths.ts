import type { AdminDeniedReason } from "@/lib/auth/admin";

/** The admin home page. */
export const ADMIN_PATH = "/admin";

/** Where `requireAdmin` sends anyone it turns away. */
export const ADMIN_DENIED_PATH = "/admin/denied";

/**
 * `returnTo` is the page the person was turned away from. It's kept when
 * access couldn't be checked and the page was an event page or its staff
 * check-in page, so the denied screen can retry that page by itself (those
 * pages are used at the door, and one failed check shouldn't end that). It's
 * also kept for the staff check-in page whatever the reason, so the screen
 * can link back to that event's member check-in.
 */
export function adminDeniedPath(
  reason: AdminDeniedReason,
  returnTo?: string,
): string {
  const base = `${ADMIN_DENIED_PATH}?reason=${reason}`;
  // The staff check-in page is kept for both reasons: the screen needs its
  // event to link a turned-away person back to check-in.
  const keep =
    staffCheckinEventId(returnTo) !== null ||
    (reason === "unavailable" && deniedRetryPath(returnTo) !== null);
  return keep ? `${base}&returnTo=${encodeURIComponent(returnTo!)}` : base;
}

/**
 * The page the denied screen may send the browser back to, from its
 * `returnTo` query, or null. Only `/admin/events/<one encoded id>` and that
 * event's `/checkin` page qualify, so the query can't point a refresh anywhere
 * else (another site, another path, a query string, `..`).
 */
export function deniedRetryPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = /^\/admin\/events\/([A-Za-z0-9_%.~-]+)(?:\/checkin)?$/.exec(
    value,
  )?.[1];
  if (!id || /^\.+$/.test(id)) return null;
  return value;
}

/** An event's staff check-in page. The id is encoded so it can't alter the path. */
export function staffCheckinPath(eventId: string): string {
  return `${adminEventPath(eventId)}/checkin`;
}

/**
 * The event id when `value` is exactly a staff check-in path, decoded, or
 * null. Lets the denied screen link back to that event's member check-in page.
 */
export function staffCheckinEventId(value: unknown): string | null {
  if (typeof value !== "string" || deniedRetryPath(value) === null) return null;
  const encoded = /^\/admin\/events\/([^/]+)\/checkin$/.exec(value)?.[1];
  if (!encoded) return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

/**
 * The reason from the denied page's query. The query only picks the wording
 * and grants nothing, so anything unrecognized is plain `not_admin`.
 */
export function deniedReason(value: unknown): AdminDeniedReason {
  return value === "unavailable" ? "unavailable" : "not_admin";
}

/** An event's admin page. The id is encoded so it can't alter the path. */
export function adminEventPath(eventId: string): string {
  return `/admin/events/${encodeURIComponent(eventId)}`;
}

/**
 * The staff check-in page with a member picked, for the verdict and the
 * result. `q` keeps the search the volunteer was on, so "Search again" isn't
 * empty; `nothing_saved` marks a confirm that failed before anything was
 * written.
 */
export function staffMemberPath(
  eventId: string,
  memberId: string,
  { problem, q }: { problem?: "nothing_saved"; q?: string } = {},
): string {
  let path = `${staffCheckinPath(eventId)}?member=${encodeURIComponent(memberId)}`;
  if (problem) path += `&problem=${problem}`;
  if (q) path += `&q=${encodeURIComponent(q)}`;
  return path;
}

/** The staff check-in page with a search typed in (or the empty search). */
export function staffSearchPath(eventId: string, q: string): string {
  return q
    ? `${staffCheckinPath(eventId)}?q=${encodeURIComponent(q)}`
    : staffCheckinPath(eventId);
}

/**
 * Where signing in again should land, from the denied page's `returnTo`: back
 * on the staff check-in page for someone turned away from it, otherwise
 * `/admin`.
 */
export function deniedSignInReturn(value: unknown): string {
  return staffCheckinEventId(value) !== null ? (value as string) : ADMIN_PATH;
}
