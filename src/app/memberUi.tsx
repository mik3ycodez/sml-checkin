import type { ReactNode } from "react";
import { membershipNoticeText, type MembershipNotice } from "@/lib/membership";
import { tidyhqSiteUrl } from "@/lib/tidyhq/site";
import { staffCheckinPath } from "./admin/paths";

// Pieces shared by the member pages (check-in and `/me`): plain links and
// forms, so they work on older phones without JavaScript.

export const PRIMARY =
  "rounded-lg bg-foreground px-4 py-3 text-center text-lg font-semibold text-background";
export const SECONDARY =
  "rounded-lg border border-foreground/20 px-4 py-3 text-center text-lg";

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
        <button type="submit" className="underline">
          Sign out
        </button>
      </span>
    </form>
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
    <a
      href={staffCheckinPath(eventId)}
      className="text-foreground/70 underline"
    >
      Are you a volunteer?
    </a>
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
    <div className="border-foreground/20 flex flex-col gap-3 rounded-lg border p-4">
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
