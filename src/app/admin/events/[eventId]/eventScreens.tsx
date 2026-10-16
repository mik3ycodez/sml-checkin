import type { AdminEventPage, NoQrReason } from "@/lib/admin/eventPage";
import { seattleTimeLabel } from "@/lib/dates";
import type { IgnoredWindowReason } from "@/lib/tidyhq/checkinWindow";
import { parseTime } from "@/lib/tidyhq/timeRange";
import { SignedInAs } from "../../../memberUi";
import { ADMIN_PATH, adminEventPath } from "../../paths";

// Plain server-rendered markup, like the member pages: no client JavaScript.
// Controls carry `print:hidden`, so printing the page gives a sheet with the
// event's name, time, QR code and link, ready to post at the door.

const BACK_LINK = "underline print:hidden";

function BackToEvents() {
  return (
    <a href={ADMIN_PATH} className={BACK_LINK}>
      ← All events
    </a>
  );
}

const WINDOW_PROBLEM: Record<IgnoredWindowReason, string> = {
  half_filled: "The check-in window in TidyHQ has only one of its two times.",
  unparseable: "The check-in window in TidyHQ has a time that can't be read.",
  backwards: "The check-in window in TidyHQ closes before it opens.",
};

const NO_QR: Record<NoQrReason, string> = {
  archived:
    "This event is archived in TidyHQ, so it has no check-in QR code. Unarchive it in TidyHQ if it's still running.",
  no_group:
    "This event has no attendance group, so check-in can't record anyone and there is no QR code.",
  never_opens:
    "Check-in can't open for this event: it has no usable check-in window, and its own start and end times don't work either. Fix them in TidyHQ to get a QR code.",
};

function timeLabel(iso: string | null): string {
  const date = parseTime(iso);
  return date ? seattleTimeLabel(date) : "Time not set";
}

function CheckinStatus({ event }: { event: AdminEventPage }) {
  const { window } = event;
  // Not when members can't check in at all: the reason is shown instead, and
  // "open" or a window would be untrue.
  if (event.checkin === "unavailable") return null;
  if (!window.opensAt || !window.closesAt) return null;
  const state = {
    not_yet: "Check-in isn't open yet.",
    open: "Check-in is open.",
    closed: "Check-in is closed.",
  }[event.checkin];
  return (
    <div className="flex flex-col gap-1">
      <p className="font-semibold">{state}</p>
      <p className="text-foreground/70">
        Opens {seattleTimeLabel(window.opensAt)}, closes{" "}
        {seattleTimeLabel(window.closesAt)}
        {window.source === "fallback" && <> (the event&apos;s start and end)</>}
        .
      </p>
    </div>
  );
}

function WindowWarning({ event }: { event: AdminEventPage }) {
  if (!event.windowWarning) return null;
  // Only say the event's times are in use when check-in can really run.
  const falling = event.checkin !== "unavailable";
  return (
    <div
      role="alert"
      className="border-foreground flex flex-col gap-1 rounded-lg border-2 p-4 print:hidden"
    >
      <p className="font-semibold">Check the check-in window in TidyHQ.</p>
      <p>
        {WINDOW_PROBLEM[event.windowWarning]}{" "}
        {falling
          ? "Check-in is using the event's start and end instead."
          : "It was ignored."}
      </p>
    </div>
  );
}

function QrBlock({
  event,
  qr,
}: {
  event: AdminEventPage;
  qr: { svg: string; url: string } | null;
}) {
  if (event.qr.kind === "none" || !qr) {
    return (
      <p className="border-foreground/20 rounded-lg border p-4 text-lg">
        {event.qr.kind === "none" ? NO_QR[event.qr.reason] : null}
      </p>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3">
      {/* White behind the code in any theme: scanners need dark on light. */}
      <div
        role="img"
        aria-label={`QR code for checking in to ${event.name ?? "this event"}`}
        className="w-full max-w-md rounded-lg bg-white p-2 print:max-w-none"
        // The library's own SVG markup (no event text goes into it).
        dangerouslySetInnerHTML={{ __html: qr.svg }}
      />
      <p className="text-center text-lg break-all">{qr.url}</p>
    </div>
  );
}

export function AdminEventScreen({
  name,
  event,
  qr,
}: {
  /** The signed-in admin. */
  name: string;
  event: AdminEventPage;
  /** The QR code's SVG markup and the link it opens; null when there's no code. */
  qr: { svg: string; url: string } | null;
}) {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <BackToEvents />
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">
          {event.name ?? "Untitled event"}
        </h1>
        <p className="text-foreground/70 text-lg">
          {timeLabel(event.startAt)}
          {event.location !== null && <> · {event.location}</>}
        </p>
      </div>
      <WindowWarning event={event} />
      <CheckinStatus event={event} />
      <QrBlock event={event} qr={qr} />
      <div className="print:hidden">
        <SignedInAs name={name} returnTo={adminEventPath(event.id)} />
      </div>
    </div>
  );
}

export function UnknownAdminEvent({ name }: { name: string }) {
  return (
    <div className="flex flex-1 flex-col gap-4">
      <BackToEvents />
      <h1 className="text-2xl font-bold tracking-tight">
        We couldn&apos;t find that event
      </h1>
      <p className="text-foreground/70 text-lg">
        TidyHQ has no event with that link. Pick one from the list.
      </p>
      <SignedInAs name={name} returnTo={ADMIN_PATH} />
    </div>
  );
}
