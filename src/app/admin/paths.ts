import type { AdminDeniedReason } from "@/lib/auth/admin";

/** The admin home page. */
export const ADMIN_PATH = "/admin";

/** Where `requireAdmin` sends anyone it turns away. */
export const ADMIN_DENIED_PATH = "/admin/denied";

/**
 * `returnTo` is the page the person was turned away from. It's kept only when
 * access couldn't be checked and the page was an event page, so the denied
 * screen can retry that page by itself (the event page reloads itself while
 * check-in is live, and one failed check shouldn't end that).
 */
export function adminDeniedPath(
  reason: AdminDeniedReason,
  returnTo?: string,
): string {
  const base = `${ADMIN_DENIED_PATH}?reason=${reason}`;
  if (reason === "unavailable" && deniedRetryPath(returnTo)) {
    return `${base}&returnTo=${encodeURIComponent(returnTo!)}`;
  }
  return base;
}

/**
 * The event page the denied screen may send the browser back to, from its
 * `returnTo` query, or null. Only `/admin/events/<one encoded id>` qualifies,
 * so the query can't point a refresh anywhere else (another site, another
 * path, a query string, `..`).
 */
export function deniedRetryPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = /^\/admin\/events\/([A-Za-z0-9_%.~-]+)$/.exec(value)?.[1];
  if (!id || /^\.+$/.test(id)) return null;
  return value;
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
