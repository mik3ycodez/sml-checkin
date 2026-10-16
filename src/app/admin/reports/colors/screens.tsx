import type {
  ColorsOwed,
  OwedMember,
  UncheckedMember,
} from "@/lib/admin/colorsOwed";
import type { RewardStanding } from "@/lib/rewards";
import { SECONDARY, SignedInAs } from "../../../memberUi";
import { ADMIN_PATH, COLORS_REPORT_PATH } from "../../paths";

// Plain server-rendered markup, like the other admin pages: no client JavaScript.

const STANDING_LABEL: Record<RewardStanding, string> = {
  current: "Current member",
  balance_due: "Balance due",
  grace: "In grace period",
  lapsed: "Membership lapsed",
  non_member: "No membership",
};

const PROBLEM_LABEL: Record<UncheckedMember["problem"], string> = {
  points: "Points total can't be read",
  issued: "Colors issued field can't be read",
  both: "Points total and colors issued field can't be read",
};

const ROW = "border-foreground/20 flex flex-col gap-1 rounded-lg border p-4";

function Group({
  title,
  empty,
  children,
  count,
}: {
  title: string;
  empty: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold">
        {title} ({count})
      </h2>
      {count === 0 ? (
        <p className="text-foreground/70">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">{children}</ul>
      )}
    </section>
  );
}

/** Email, or the TidyHQ contact id, so same-named people can be told apart. */
function Identity({
  member,
}: {
  member: { contactId: string; email: string | null };
}) {
  return (
    <span className="text-foreground/70">
      {member.email ?? `TidyHQ contact ${member.contactId}`}
    </span>
  );
}

function OwedRow({ member }: { member: OwedMember }) {
  return (
    <li className={ROW}>
      <span className="text-lg font-semibold">{member.name}</span>
      <span className="text-foreground/70">
        {member.points} points · {STANDING_LABEL[member.standing]}
      </span>
      <Identity member={member} />
    </li>
  );
}

/** `report` is null if TidyHQ couldn't be read: no lists, just a retry. */
export function ColorsReportScreen({
  report,
  name,
}: {
  report: ColorsOwed | null;
  name: string;
}) {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight">Club colors owed</h1>
      {report === null ? (
        <>
          <p className="text-lg">
            This report is temporarily unavailable: we couldn&apos;t read
            members from TidyHQ just now.
          </p>
          <a href={COLORS_REPORT_PATH} className={SECONDARY}>
            Try again
          </a>
        </>
      ) : (
        <>
          <p className="text-foreground/70">
            Members at 18 points or more who aren&apos;t marked as having
            received club colors. This is a cross-check only: TidyHQ is the
            official record, and this app never marks colors issued.
          </p>
          <Group
            title="Ready to receive colors"
            count={report.ready.length}
            empty="Nobody right now."
          >
            {report.ready.map((m) => (
              <OwedRow key={m.contactId} member={m} />
            ))}
          </Group>
          <Group
            title="Needs to renew or pay first"
            count={report.renewFirst.length}
            empty="Nobody right now."
          >
            {report.renewFirst.map((m) => (
              <OwedRow key={m.contactId} member={m} />
            ))}
          </Group>
          <Group
            title="Needs checking"
            count={report.needsChecking.length}
            empty="Nothing unreadable."
          >
            {report.needsChecking.map((m) => (
              <li key={m.contactId} className={ROW}>
                <span className="text-lg font-semibold">{m.name}</span>
                <span className="text-foreground/70">
                  {PROBLEM_LABEL[m.problem]}. Check it in TidyHQ.
                </span>
                <Identity member={m} />
              </li>
            ))}
          </Group>
        </>
      )}
      <a href={ADMIN_PATH} className="text-foreground/70 underline">
        Back to admin
      </a>
      <SignedInAs name={name} returnTo={COLORS_REPORT_PATH} />
    </div>
  );
}
