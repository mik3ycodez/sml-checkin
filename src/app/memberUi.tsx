import type { ReactNode } from "react";
import { membershipNoticeText, type MembershipNotice } from "@/lib/membership";
import { tidyhqSiteUrl } from "@/lib/tidyhq/site";
import { checkinPath, ME_PATH, staffCheckinPath } from "./memberPaths";

// Pieces shared by the member pages (check-in and `/me`): plain links and
// forms, so they work on older phones without JavaScript.

export const PRIMARY =
  "rounded-lg bg-accent px-4 py-3 text-center text-lg font-semibold text-on-accent";
export const SECONDARY =
  "rounded-lg border border-accent px-4 py-3 text-center text-lg text-accent";

/**
 * Who's signed in, with a way to switch members on a shared phone. A plain
 * form post (sign-out refuses GETs), returning to `returnTo`: the page the
 * member was on, which sends the next member straight to sign-in. With no
 * name (TidyHQ couldn't say who it is) it only offers the sign-out.
 */
export function SignedInAs({
  name,
  returnTo,
}: {
  name: string | null;
  returnTo: string;
}) {
  return (
    <form method="post" action="/auth/signout" className="text-foreground/70">
      <input type="hidden" name="returnTo" value={returnTo} />
      {name !== null && <>Signed in as {name}. </>}
      <span className="whitespace-nowrap">
        {name !== null && <>Not you? </>}
        <button type="submit" className="text-accent underline">
          Sign out
        </button>
      </span>
    </form>
  );
}

const QUIET_LINK = "text-accent underline";

/**
 * A quiet link to the member's status page, in the same style as
 * `VolunteerLink` so it never competes with the Check in button. Left off
 * screens that already link to /me.
 */
export function MyPointsLink() {
  return (
    <a href={ME_PATH} className={QUIET_LINK}>
      My points and status
    </a>
  );
}

/**
 * A plain link from a member's event page to that event's staff check-in
 * page. It's shown to every signed-in member without checking any group:
 * `requireVolunteer` decides on the tap, so the page leaks nothing about who
 * volunteers.
 */
export function VolunteerLink({ eventId }: { eventId: string }) {
  return (
    <a href={staffCheckinPath(eventId)} className={QUIET_LINK}>
      Are you a volunteer?
    </a>
  );
}

/**
 * The footer of a member's event screen: the quiet links, then who's signed
 * in. `points` is false on screens that already link to /me; `volunteer` is
 * false once volunteer mode has ended for the event.
 */
export function MemberFooter({
  eventId,
  name,
  points = true,
  volunteer = true,
}: {
  eventId: string;
  name: string | null;
  points?: boolean;
  volunteer?: boolean;
}) {
  return (
    <>
      {points && <MyPointsLink />}
      {volunteer && <VolunteerLink eventId={eventId} />}
      <SignedInAs name={name} returnTo={checkinPath(eventId)} />
    </>
  );
}

/** A message with one link to SML's TidyHQ site, where members act on it. */
export function TidyHqNotice({
  children,
  linkLabel,
}: {
  children: ReactNode;
  linkLabel: string;
}) {
  return (
    <div className="bg-surface border-border flex flex-col gap-3 rounded-lg border p-4">
      <p className="text-lg">{children}</p>
      <a href={tidyhqSiteUrl()} className={SECONDARY}>
        {linkLabel}
      </a>
    </div>
  );
}

/** A balance-due or grace-period message, linking to TidyHQ to act on it. */
export function MembershipNoticeBlock({
  notice,
  now,
}: {
  notice: MembershipNotice;
  now: Date;
}) {
  return (
    <TidyHqNotice
      linkLabel={notice.kind === "grace" ? "Renew on TidyHQ" : "Pay on TidyHQ"}
    >
      {membershipNoticeText(notice, now)}
    </TidyHqNotice>
  );
}
