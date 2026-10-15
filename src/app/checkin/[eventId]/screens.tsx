import type { ReactNode } from "react";
import type { CheckInAssessment } from "@/lib/checkin/checkIn";
import type { TapOutcome } from "@/lib/checkin/tapNotice";
import { seattleTimeLabel } from "@/lib/dates";
import { membershipNoticeText, type MembershipNotice } from "@/lib/membership";
import {
  newlyQualified,
  rewardMessage,
  standingFromNotice,
} from "@/lib/rewards";
import { tidyhqSiteUrl } from "@/lib/tidyhq/site";

// Shared pieces of the check-in pages: one small screen per outcome, chosen
// by `StatusScreen` from what TidyHQ says now. Kept to plain links and forms
// so they work on older phones without JavaScript.

export function checkinPath(eventId: string): string {
  return `/checkin/${encodeURIComponent(eventId)}`;
}

export function signInPath(eventId: string): string {
  return `/auth/signin?returnTo=${encodeURIComponent(checkinPath(eventId))}`;
}

export function UnknownEvent() {
  return (
    <Screen title="We couldn't find that event">
      <Note>
        The QR code may be for another event, or the event may have been
        removed. Please ask a volunteer at the door to check you in.
      </Note>
    </Screen>
  );
}

/** The event's name, or a stand-in if TidyHQ has none. */
export function eventTitle(name: string | null): string {
  return name ?? "SML event";
}

export function resultPath(eventId: string): string {
  return `${checkinPath(eventId)}/result`;
}

export function problemPath(eventId: string): string {
  return `${checkinPath(eventId)}/problem`;
}

/**
 * Who's signed in, with a way to switch members on a shared phone. A plain
 * form post (sign-out refuses GETs), returning to this event's check-in page,
 * which sends the next member straight to sign-in.
 */
export function SignedInAs({
  name,
  eventId,
}: {
  name: string;
  eventId: string;
}) {
  return (
    <form method="post" action="/auth/signout" className="text-foreground/70">
      <input type="hidden" name="returnTo" value={checkinPath(eventId)} />
      Signed in as {name}.{" "}
      <span className="whitespace-nowrap">
        Not you?{" "}
        <button type="submit" className="underline">
          Sign out
        </button>
      </span>
    </form>
  );
}

/** What the pages show for every status except "ready" (which shows the button). */
export type ShownStatus = Exclude<
  CheckInAssessment,
  { status: "ready" } | { status: "unknown_contact" }
>;

/**
 * The screen for a member's status at an event. `notice` is what the tap that
 * led here did (from the tap notice), or null on a plain page load.
 */
export function StatusScreen({
  status,
  eventId,
  notice,
  now = new Date(),
}: {
  status: ShownStatus;
  eventId: string;
  notice: TapOutcome | null;
  /** For tests; the real clock otherwise. */
  now?: Date;
}) {
  if (status.status === "unknown_event") return <UnknownEvent />;

  const event = eventTitle(status.eventName);
  const signedInAs = <SignedInAs name={status.name} eventId={eventId} />;
  switch (status.status) {
    case "already_checked_in":
      return (
        <CheckedIn
          status={status}
          event={event}
          notice={notice}
          now={now}
          signedInAs={signedInAs}
        />
      );
    case "membership_inactive":
      return (
        <Screen event={event} title="Your membership isn't active">
          <Note>
            Check-in is for current SML members. You can renew on TidyHQ, then
            come back and check in.
          </Note>
          <a href={tidyhqSiteUrl()} className={PRIMARY}>
            Renew on TidyHQ
          </a>
          <a href={checkinPath(eventId)} className={SECONDARY}>
            I&apos;ve renewed, check me in
          </a>
          <Note>
            Just renewed? It can take a minute to update. Try again shortly.
          </Note>
          {signedInAs}
        </Screen>
      );
    case "not_open":
      return (
        <Screen event={event} title="Check-in hasn't opened yet">
          <Note>
            Check-in opens {seattleTimeLabel(status.opensAt)} (Seattle time).
            Scan the code again then.
          </Note>
          {signedInAs}
        </Screen>
      );
    case "closed":
      return (
        <Screen event={event} title="Check-in has closed">
          <Note>If you were there, a volunteer can check you in.</Note>
          {signedInAs}
        </Screen>
      );
    case "points_unreadable":
      return (
        <Screen event={event} title="Please see a volunteer">
          <Note>
            You&apos;re not checked in yet. There&apos;s a problem with your
            points total in TidyHQ, and a volunteer needs to fix it before you
            can check in.
          </Note>
          {signedInAs}
        </Screen>
      );
  }
}

/** A member in the event's group, worded for what the tap (if any) did. */
function CheckedIn({
  status,
  event,
  notice,
  now,
  signedInAs,
}: {
  status: Extract<ShownStatus, { status: "already_checked_in" }>;
  event: string;
  notice: TapOutcome | null;
  now: Date;
  signedInAs: ReactNode;
}) {
  switch (notice?.kind) {
    case "awarded":
      return (
        <Screen event={event} title={`You're checked in, ${status.name}!`} big>
          <p className="text-4xl font-bold">
            +{notice.points} {notice.points === 1 ? "point" : "points"}
          </p>
          <Total total={status.total} />
          {notice.membershipNotice && (
            <MembershipNoticeBlock notice={notice.membershipNotice} now={now} />
          )}
          {newlyQualified(status.rewards, {
            total: status.total ?? 0,
            awarded: notice.points,
          }).map(({ reward, status: rewardState }) => (
            <p key={reward.id} className="text-lg font-semibold">
              {rewardMessage(
                reward,
                rewardState,
                standingFromNotice(notice.membershipNotice),
              )}
            </p>
          ))}
          {signedInAs}
        </Screen>
      );
    case "point_not_saved":
      // No total: it's missing the point. No "try again": it would only say
      // "already checked in". A volunteer can add the point in TidyHQ.
      return (
        <Screen
          event={event}
          title="You're checked in, but your point didn't save"
        >
          <Note>Please let a volunteer know.</Note>
          {notice.membershipNotice && (
            <MembershipNoticeBlock notice={notice.membershipNotice} now={now} />
          )}
          {signedInAs}
        </Screen>
      );
    case "repeat":
      return (
        <Screen event={event} title="You're already checked in">
          <Note>One check-in per event, so no extra point this time.</Note>
          <Total total={status.total} />
          {signedInAs}
        </Screen>
      );
    default:
      return (
        <Screen event={event} title="You're already checked in">
          <Total total={status.total} />
          {signedInAs}
        </Screen>
      );
  }
}

/** A balance-due or grace-period message, linking to SML's TidyHQ to act on it. */
function MembershipNoticeBlock({
  notice,
  now,
}: {
  notice: MembershipNotice;
  now: Date;
}) {
  return (
    <div className="border-foreground/20 flex flex-col gap-3 rounded-lg border p-4">
      <p className="text-lg">{membershipNoticeText(notice, now)}</p>
      <a href={tidyhqSiteUrl()} className={SECONDARY}>
        {notice.kind === "grace" ? "Renew on TidyHQ" : "Pay on TidyHQ"}
      </a>
    </div>
  );
}

/** Shown when TidyHQ failed partway through a check-in. */
export function CheckinProblem({ eventId }: { eventId: string }) {
  return (
    <Screen title="Something went wrong">
      <Note>
        We couldn&apos;t finish checking you in. Please try again, or ask a
        volunteer at the door for help.
      </Note>
      <a href={checkinPath(eventId)} className={PRIMARY}>
        Try again
      </a>
    </Screen>
  );
}

const PRIMARY =
  "rounded-lg bg-foreground px-4 py-3 text-center text-lg font-semibold text-background";
const SECONDARY =
  "rounded-lg border border-foreground/20 px-4 py-3 text-center text-lg";

function Screen({
  event,
  title,
  big = false,
  children,
}: {
  event?: string;
  title: string;
  big?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-4">
      {event && <p className="text-foreground/70 text-lg">{event}</p>}
      <h1
        className={`${big ? "text-3xl" : "text-2xl"} font-bold tracking-tight`}
      >
        {title}
      </h1>
      {children}
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-foreground/70 text-lg">{children}</p>;
}

/** The stored total, or nothing if it's unreadable. */
function Total({ total }: { total: number | null }) {
  if (total === null) return null;
  return (
    <p className="text-xl">
      Total: <span className="font-semibold">{total}</span>
    </p>
  );
}
