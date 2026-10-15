import type { ReactNode } from "react";
import { dateLabel, seattleDate } from "@/lib/dates";
import {
  RECENT_EVENTS_DAYS,
  type RecentEvent,
} from "@/lib/member/recentEvents";
import type { MemberSummary } from "@/lib/member/memberSummary";
import { membershipNoticeText } from "@/lib/membership";
import { tidyhqSiteUrl } from "@/lib/tidyhq/site";
import { SignedInAs } from "../checkin/[eventId]/screens";

// The member status page: plain server-rendered HTML with no client
// JavaScript, so it reads the same on older phones and when scripts fail.
// View only: renewals and payments happen in TidyHQ, so the page links there.

export const ME_PATH = "/me";

type Shown = Exclude<MemberSummary, { status: "unknown_contact" }>;

export function MeScreen({
  summary,
  recentEvents,
  now = new Date(),
}: {
  summary: Shown;
  /** Null when TidyHQ couldn't be read: that section says so, the rest shows. */
  recentEvents: RecentEvent[] | null;
  /** For tests; the real clock otherwise. */
  now?: Date;
}) {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">{summary.name}</h1>
        {summary.status === "ok" && (
          <p className="text-foreground/70 text-lg">{summary.level}</p>
        )}
      </header>

      <Points points={summary.points} />
      <Membership summary={summary} now={now} />

      {summary.rewards.length > 0 && (
        <Section>
          {summary.rewards.map((r) => (
            <p key={r.reward.id} className="text-lg">
              {r.message}
            </p>
          ))}
        </Section>
      )}

      <RecentEvents events={recentEvents} />
      <SignedInAs name={summary.name} returnTo={ME_PATH} />
    </div>
  );
}

function Points({ points }: { points: number | null }) {
  if (points === null) {
    return (
      <p className="text-lg">
        Your points total needs fixing. Please see a volunteer.
      </p>
    );
  }
  return (
    <p className="text-2xl">
      Points: <span className="font-bold">{points}</span>
    </p>
  );
}

function Membership({ summary, now }: { summary: Shown; now: Date }) {
  if (summary.status === "not_member") {
    return (
      <Section>
        <p className="text-lg">You&apos;re not a member yet.</p>
        <TidyLink>Become a member on TidyHQ</TidyLink>
      </Section>
    );
  }
  const { membership, membershipEndsOn: endsOn, notice } = summary;
  switch (membership) {
    case "active":
      return (
        <p className="text-lg">
          {endsOn ? `Active until ${dateLabel(endsOn)}` : "Active"}
        </p>
      );
    case "renew_soon":
      return (
        <Section>
          <p className="text-lg">
            Your membership ends on {endsOn ? dateLabel(endsOn) : "soon"}.
          </p>
          <TidyLink>Renew on TidyHQ</TidyLink>
        </Section>
      );
    case "balance_due":
    case "grace":
      return (
        <Section>
          <p className="text-lg">
            {notice ? membershipNoticeText(notice, now) : ""}
          </p>
          <TidyLink>
            {membership === "grace" ? "Renew on TidyHQ" : "Pay on TidyHQ"}
          </TidyLink>
        </Section>
      );
    case "expired":
      return (
        <Section>
          <p className="text-lg">
            {endsOn === seattleDate(now)
              ? "Your membership ends today."
              : `Your membership expired on ${endsOn ? dateLabel(endsOn) : "a past date"}.`}
          </p>
          <TidyLink>Renew on TidyHQ</TidyLink>
        </Section>
      );
  }
}

function RecentEvents({ events }: { events: RecentEvent[] | null }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xl font-semibold">Recent events</h2>
      {events === null ? (
        <p className="text-foreground/70 text-lg">
          Couldn&apos;t load recent events
        </p>
      ) : events.length === 0 ? (
        <p className="text-foreground/70 text-lg">
          No events in the last {RECENT_EVENTS_DAYS} days
        </p>
      ) : (
        <ul className="flex flex-col gap-1 text-lg">
          {events.map((e) => (
            <li key={e.id} className="flex justify-between gap-4">
              <span>{e.name ?? "SML event"}</span>
              <span className="text-foreground/70">
                {dateLabel(seattleDate(new Date(e.startAt)))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Section({ children }: { children: ReactNode }) {
  return (
    <div className="border-foreground/20 flex flex-col gap-3 rounded-lg border p-4">
      {children}
    </div>
  );
}

function TidyLink({ children }: { children: ReactNode }) {
  return (
    <a
      href={tidyhqSiteUrl()}
      className="border-foreground/20 rounded-lg border px-4 py-3 text-center text-lg"
    >
      {children}
    </a>
  );
}
