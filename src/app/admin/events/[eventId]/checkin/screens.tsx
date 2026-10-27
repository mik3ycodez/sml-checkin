import type { StaffVerdict } from "@/lib/checkin/staffVerdict";
import type { CheckinBlocker } from "@/lib/tidyhq/checkinWindow";
import type { TapOutcome } from "@/lib/checkin/tapNotice";
import { checkinPath } from "../../../../memberPaths";
import { PRIMARY, SECONDARY, SignedInAs } from "../../../../memberUi";
import {
  adminEventPath,
  staffMemberPath,
  staffSearchPath,
} from "../../../paths";
import { staffCheckInAction } from "./actions";

// Plain server-rendered markup, like the member pages: forms and links only,
// no client JavaScript, no auto-refresh (a reload would wipe a half-finished
// search).

const INPUT =
  "border-border bg-surface w-full rounded-lg border px-4 py-3 text-lg";

function Frame({
  eventId,
  eventName,
  staff,
  children,
}: {
  eventId: string;
  eventName: string | null;
  staff: { name: string; role: "admin" | "volunteer" };
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-foreground/70">Staff check-in</p>
        <h1 className="text-2xl font-bold tracking-tight">
          {eventName ?? "Untitled event"}
        </h1>
      </div>
      {children}
      <div className="flex flex-col gap-3">
        {staff.role === "admin" ? (
          <a href={adminEventPath(eventId)} className="text-accent underline">
            Back to event page
          </a>
        ) : (
          <a href={checkinPath(eventId)} className="text-accent underline">
            Stop volunteering
          </a>
        )}
        <SignedInAs name={staff.name} returnTo={checkinPath(eventId)} />
      </div>
    </div>
  );
}

type FrameProps = Omit<Parameters<typeof Frame>[0], "children">;

/** Names only, for both roles; see the milestone plan's open question on duplicates. */
export function StaffSearchScreen({
  query,
  search,
  ...frame
}: FrameProps & {
  query: string;
  search:
    | { status: "none" | "too_short" | "too_many" }
    | { status: "ok"; members: { id: string; name: string }[] }
    | { status: "unavailable" };
}) {
  return (
    <Frame {...frame}>
      <form method="get" className="flex flex-col gap-3">
        <label htmlFor="q" className="text-lg font-semibold">
          Find a member
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={query}
          autoComplete="off"
          placeholder="Name"
          className={INPUT}
        />
        <button type="submit" className={PRIMARY}>
          Search
        </button>
      </form>
      {search.status === "too_short" && (
        <p className="text-lg">Type at least 2 letters of their name.</p>
      )}
      {search.status === "too_many" && (
        <p className="text-lg">Too many matches. Type more of the name.</p>
      )}
      {search.status === "unavailable" && (
        <p role="status" className="text-lg">
          We couldn&apos;t reach TidyHQ just now.{" "}
          <a
            href={staffSearchPath(frame.eventId, query)}
            className="text-accent underline"
          >
            Try again
          </a>
        </p>
      )}
      {search.status === "ok" &&
        (search.members.length === 0 ? (
          <p className="text-lg">No members match that.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {search.members.map((m) => (
              <li key={m.id}>
                <a
                  href={staffMemberPath(frame.eventId, m.id, { q: query })}
                  className={`${SECONDARY} block`}
                >
                  {m.name}
                </a>
              </li>
            ))}
          </ul>
        ))}
    </Frame>
  );
}

function resultLine(notice: TapOutcome | null, verdict: StaffVerdict) {
  if (notice?.kind === "awarded") {
    return `Checked in. +${notice.points} ${notice.points === 1 ? "point" : "points"}.`;
  }
  if (notice?.kind === "point_not_saved") {
    return "Checked in, but the point couldn't be confirmed. Tell a Board member to check their total in TidyHQ before adding anything.";
  }
  if (notice?.kind === "repeat") {
    return "Already checked in. No point awarded.";
  }
  return verdict.text;
}

/** One member's verdict, with the confirm button only if they can check in. */
export function StaffVerdictScreen({
  verdict,
  notice,
  warnings,
  nothingSaved,
  memberId,
  query,
  ...frame
}: FrameProps & {
  verdict: StaffVerdict;
  /** What the confirm just did, when the member is now checked in. */
  notice: TapOutcome | null;
  /** Admin-only warnings about the member's membership records. */
  warnings: string[];
  /** The last confirm failed before anything was saved. */
  nothingSaved: boolean;
  memberId: string;
  query: string;
}) {
  const back = staffSearchPath(frame.eventId, query);
  return (
    <Frame {...frame}>
      <div className="bg-surface border-border flex flex-col gap-2 rounded-lg border p-4">
        <p className="text-2xl font-semibold">{verdict.name}</p>
        {verdict.total !== null && (
          <p className="text-lg">
            {verdict.total} {verdict.total === 1 ? "point" : "points"}
          </p>
        )}
        <p role="status" className="text-lg font-semibold">
          {resultLine(notice, verdict)}
        </p>
      </div>
      {nothingSaved && (
        <p role="alert" className="text-lg">
          Nothing was saved. Please try again.
        </p>
      )}
      {warnings.length > 0 && (
        <ul
          role="alert"
          className="border-foreground flex flex-col gap-1 rounded-lg border-2 p-4"
        >
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      {verdict.canCheckIn && (
        <form action={staffCheckInAction.bind(null, frame.eventId)}>
          <input type="hidden" name="member" value={memberId} />
          <input type="hidden" name="q" value={query} />
          <button type="submit" className={`${PRIMARY} w-full`}>
            Check in {verdict.name}
          </button>
        </form>
      )}
      <a href={back} className={SECONDARY}>
        {notice ? "Next member" : "Search again"}
      </a>
    </Frame>
  );
}

/** A message with a way forward, for the pages' rare dead ends. */
export function StaffNotice({
  heading,
  children,
  linkHref,
  linkLabel,
}: {
  heading: string;
  children: React.ReactNode;
  linkHref: string;
  linkLabel: string;
}) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-4">
      <h1 className="text-2xl font-bold tracking-tight">{heading}</h1>
      <p className="text-foreground/70 text-lg">{children}</p>
      <a href={linkHref} className={SECONDARY}>
        {linkLabel}
      </a>
    </div>
  );
}

/**
 * What a volunteer sees once check-in has closed, the event is archived, or
 * check-in can never open. There's no cookie to clear: leaving is the link.
 * Only a closed event is "over"; for the rest, check-in never ran or was
 * switched off, which the Board needs to hear about, so no thanks.
 */
export function VolunteerModeEnded({
  eventId,
  reason,
}: {
  eventId: string;
  reason: CheckinBlocker | "closed";
}) {
  return (
    <StaffNotice heading="Volunteer mode has ended" {...backToCheckin(eventId)}>
      {reason === "closed"
        ? "Check-in for this event is over. Thank you for helping!"
        : "Check-in isn't available for this event. Please tell a Board member."}
    </StaffNotice>
  );
}

export const backToCheckin = (eventId: string) => ({
  linkHref: checkinPath(eventId),
  linkLabel: "Back to check-in",
});
