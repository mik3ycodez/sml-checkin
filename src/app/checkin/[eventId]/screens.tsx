import type { ReactNode } from "react";
import type { CheckInAssessment } from "@/lib/checkin/checkIn";
import type { TapOutcome } from "@/lib/checkin/tapNotice";
import { seattleTimeLabel } from "@/lib/dates";
import { findReward, rewardMessage, type QualifiedReward } from "@/lib/rewards";
import { tidyhqSiteUrl } from "@/lib/tidyhq/site";
import {
  checkinPath,
  ME_PATH,
  signInPath as memberSignInPath,
} from "../../memberPaths";
import {
  MembershipNoticeBlock,
  MemberFooter,
  PRIMARY,
  SECONDARY,
} from "../../memberUi";

// Shared pieces of the check-in pages: one small screen per outcome, chosen
// by `StatusScreen` from what TidyHQ says now. Kept to plain links and forms
// so they work on older phones without JavaScript.

export function signInPath(eventId: string): string {
  return memberSignInPath(checkinPath(eventId));
}

export function UnknownEvent() {
  return (
    <Screen title="We couldn't find that event">
      <Note>
        The QR code may be for another event, or the event may have been
        removed. Please tell a Board member.
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
  // Checked-in screens already link to /me ("See your points").
  // Checked-in screens already link to /me ("See your points"). Closed and
  // unavailable events have no volunteer mode to enter.
  const volunteerOver =
    status.status === "closed" || status.status === "event_unavailable";
  const signedInAs = (
    <MemberFooter
      eventId={eventId}
      points={status.status !== "already_checked_in"}
      volunteer={!volunteerOver}
    />
  );
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
          <Note>If you were there, tell a Board member.</Note>
          {signedInAs}
        </Screen>
      );
    case "event_unavailable":
      return (
        <Screen event={event} title="This event isn't open for check-in">
          <Note>
            Check-in isn&apos;t available for this event. If you were there,
            tell a Board member.
          </Note>
          {signedInAs}
        </Screen>
      );
    case "points_unreadable":
      return (
        <Screen event={event} title="Please see a Board member">
          <Note>
            You&apos;re not checked in yet. There&apos;s a problem with your
            points total in TidyHQ. A Board member needs to fix your points in
            TidyHQ before you can check in.
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
          {notice.qualified?.map((q) => (
            <QualifiedMessage key={q.rewardId} qualified={q} />
          ))}
          <PointsLink />
          {signedInAs}
        </Screen>
      );
    case "point_not_saved":
      // No total: the point is unconfirmed. No "try again": it would only say
      // "already checked in". The write may have landed, so a Board member
      // checks the total in TidyHQ before adding anything.
      return (
        <Screen
          event={event}
          title="You're checked in, but we couldn't confirm your point"
        >
          <Note>
            Please tell a Board member. They should check your total in TidyHQ
            before adding anything.
          </Note>
          {notice.membershipNotice && (
            <MembershipNoticeBlock notice={notice.membershipNotice} now={now} />
          )}
          <PointsLink />
          {signedInAs}
        </Screen>
      );
    case "repeat":
      return (
        <Screen event={event} title="You're already checked in">
          <Note>One check-in per event, so no extra point this time.</Note>
          <Total total={status.total} />
          <PointsLink />
          {signedInAs}
        </Screen>
      );
    default:
      return (
        <Screen event={event} title="You're already checked in">
          <Total total={status.total} />
          <PointsLink />
          {signedInAs}
        </Screen>
      );
  }
}

/** From a check-in screen to the member's status page. */
function PointsLink() {
  return (
    <a href={ME_PATH} className={SECONDARY}>
      See your points
    </a>
  );
}

/** "You qualify for…", for a reward this check-in's point just reached. */
function QualifiedMessage({ qualified }: { qualified: QualifiedReward }) {
  const reward = findReward(qualified.rewardId);
  if (!reward) return null;
  return (
    <p className="text-lg font-semibold">
      {rewardMessage(reward, { kind: "qualified" }, qualified.standing)}
    </p>
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
