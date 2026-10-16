import { loadOrNull } from "@/app/loadOrNull";
import { getAdminEvents, type AdminEvents } from "@/lib/admin/events";
import type { TidyClient } from "@/lib/tidyhq/client";

/** The admin event list, or null if TidyHQ couldn't be read (see `loadOrNull`). */
export function loadAdminEvents(
  client: TidyClient,
  args: { now: Date },
): Promise<AdminEvents | null> {
  return loadOrNull("Couldn't load admin events", () =>
    getAdminEvents(client, args),
  );
}
