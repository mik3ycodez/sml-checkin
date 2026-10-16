import type { AdminDeniedReason } from "@/lib/auth/admin";

/** The admin home page. */
export const ADMIN_PATH = "/admin";

/** Where `requireAdmin` sends anyone it turns away. */
export const ADMIN_DENIED_PATH = "/admin/denied";

export function adminDeniedPath(reason: AdminDeniedReason): string {
  return `${ADMIN_DENIED_PATH}?reason=${reason}`;
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
