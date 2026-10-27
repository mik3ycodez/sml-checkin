import { dateLabel, seattleDate } from "@/lib/dates";
import {
  RECENT_EVENTS_DAYS,
  type RecentEvent,
} from "@/lib/member/recentEvents";
import type { MemberSummary } from "@/lib/member/memberSummary";
import { MembershipNoticeBlock, TidyHqNotice } from "../memberUi";

// The member status page: plain server-rendered HTML with no client
// JavaScript, so it reads the same on older phones and when scripts fail.
// View only: renewals and payments happen in TidyHQ, so the page links there.

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
        <div className="bg-surface border-border flex flex-col gap-3 rounded-lg border p-4">
          {summary.rewards.map((r) => (
            <p key={r.reward.id} className="text-lg">
              {r.message}
            </p>
          ))}
        </div>
      )}

      <RecentEvents events={recentEvents} />
    </div>
  );
}

function Points({ points }: { points: number | null }) {
  if (points === null) {
    return (
      <p className="text-lg">
        Your points total needs fixing. Please see a Board member.
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
      <TidyHqNotice linkLabel="Become a member on TidyHQ">
        You&apos;re not a member yet.
      </TidyHqNotice>
    );
  }
  const endsOn = summary.membershipEndsOn;
  switch (summary.membership) {
    case "active":
      return (
        <p className="text-lg">
          {endsOn ? `Active until ${dateLabel(endsOn)}` : "Active"}
        </p>
      );
    case "renew_soon":
      return (
        <TidyHqNotice linkLabel="Renew on TidyHQ">
          Your membership ends on {endsOn ? dateLabel(endsOn) : "soon"}.
        </TidyHqNotice>
      );
    case "balance_due":
    case "grace":
      return <MembershipNoticeBlock notice={summary.notice} now={now} />;
    case "expired":
      // An end date still ahead (a record TidyHQ marked expired early) must
      // not read as "expired on" a day that hasn't come.
      return (
        <TidyHqNotice linkLabel="Renew on TidyHQ">
          {endsOn && endsOn < seattleDate(now)
            ? `Your membership expired on ${dateLabel(endsOn)}.`
            : "Your membership isn't active."}
        </TidyHqNotice>
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
