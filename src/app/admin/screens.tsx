import { refreshIntervalSeconds } from "@/lib/admin/attendees";
import type { AdminDeniedReason } from "@/lib/auth/admin";
import { SECONDARY, SignedInAs } from "../memberUi";
import type { AdminEvent, AdminEvents } from "@/lib/admin/events";
import { seattleTimeLabel } from "@/lib/dates";
import { checkinPath } from "../memberPaths";
import { ADMIN_PATH, adminEventPath } from "./paths";

// Plain server-rendered markup, like the member pages: no client JavaScript.

const CARD = "border-foreground/20 flex flex-col gap-1 rounded-lg border p-4";

function EventCard({ event }: { event: AdminEvent }) {
  const details = (
    <>
      <span className="text-lg font-semibold">
        {event.name ?? "Untitled event"}
      </span>
      <span className="text-foreground/70">
        {seattleTimeLabel(new Date(event.startAt))}
        {event.location !== null && <> · {event.location}</>}
      </span>
      {event.archived && (
        <span className="font-semibold">Archived in TidyHQ</span>
      )}
      {!event.hasGroup && (
        <span className="font-semibold">
          No attendance group: check-in won&apos;t work for this event.
        </span>
      )}
      {event.invalidTimes && (
        <span className="font-semibold">
          Its end time isn&apos;t after its start time. Check it in TidyHQ.
        </span>
      )}
    </>
  );
  // An archived event is shown for reference but isn't one to run check-in for.
  return event.archived ? (
    <div className={CARD}>{details}</div>
  ) : (
    <a href={adminEventPath(event.id)} className={CARD}>
      {details}
    </a>
  );
}

function EventList({ events }: { events: AdminEvent[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {events.map((event) => (
        <li key={event.id}>
          <EventCard event={event} />
        </li>
      ))}
    </ul>
  );
}

/** `events` is null if TidyHQ couldn't list them. */
export function AdminHomeScreen({
  name,
  events,
}: {
  name: string;
  events: AdminEvents | null;
}) {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
      {events === null ? (
        <p className="text-lg">
          We couldn&apos;t load the events from TidyHQ just now. Please try
          again in a minute.
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold">Upcoming</h2>
            {events.upcoming.length === 0 ? (
              <p className="text-foreground/70">No upcoming events.</p>
            ) : (
              <EventList events={events.upcoming} />
            )}
          </section>
          {events.recent.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-xl font-semibold">Recent</h2>
              <EventList events={events.recent} />
            </section>
          )}
        </>
      )}
      <SignedInAs name={name} returnTo={ADMIN_PATH} />
    </div>
  );
}

/**
 * Why a signed-in person can't use the admin pages, or (with `staffEventId`)
 * the staff check-in page, which volunteers use too. `unavailable` is
 * deliberately different from `not_admin`, so the Board knows to look at the
 * app's settings and TidyHQ rather than at who's in the group.
 */
export function AdminDeniedScreen({
  reason,
  name,
  retryPath,
  staffEventId,
}: {
  reason: AdminDeniedReason;
  /** Null if TidyHQ couldn't say who this is. */
  name: string | null;
  /**
   * A page to go back to after 30 seconds (only when access couldn't be
   * checked), so a door screen recovers from a one-off TidyHQ failure by
   * itself. The caller has validated it (`deniedRetryPath`).
   */
  retryPath?: string | null;
  /** Set when turned away from this event's staff check-in page. */
  staffEventId?: string | null;
}) {
  const retrying = reason === "unavailable" && retryPath;
  const staff = staffEventId != null;
  const retryText = retrying
    ? `We'll try again in ${refreshIntervalSeconds()} seconds.`
    : "Please try again in a minute.";
  return (
    <div className="flex flex-1 flex-col justify-center gap-4">
      {retrying && (
        <meta
          httpEquiv="refresh"
          content={`${refreshIntervalSeconds()};url=${retryPath}`}
        />
      )}
      {reason === "not_admin" ? (
        <>
          <h1 className="text-2xl font-bold tracking-tight">
            You don&apos;t have access
          </h1>
          <p className="text-foreground/70 text-lg">
            {staff
              ? "You don't have access to staff check-in. If you should, ask a Board member to add you to the App Check-In Volunteers group in TidyHQ."
              : "You don't have access to the admin pages. If you should, ask a Board member to add you to the App Admin group in TidyHQ."}
          </p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-bold tracking-tight">
            {staff ? "Check-in access unavailable" : "Admin access unavailable"}
          </h1>
          <p className="text-foreground/70 text-lg">
            {staff
              ? "We couldn't check check-in access just now, so staff check-in isn't available."
              : "We couldn't check admin access just now, so nobody can use the admin pages."}{" "}
            {retryText} If it keeps happening, tell whoever runs this site.
          </p>
        </>
      )}
      {staff && (
        <a href={checkinPath(staffEventId)} className={SECONDARY}>
          Back to check-in
        </a>
      )}
      <SignedInAs
        name={name}
        returnTo={staff ? checkinPath(staffEventId) : ADMIN_PATH}
      />
    </div>
  );
}
