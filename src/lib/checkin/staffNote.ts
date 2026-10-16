import { SML_TIME_ZONE } from "../dates";

/** Who did a staff check-in. The id and name come from the guard, never a form. */
export interface StaffActor {
  contactId: string;
  name: string;
  role: "admin" | "volunteer";
}

const noteTimeParts = new Intl.DateTimeFormat("en-US", {
  timeZone: SML_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** "2026-10-14 7:32 PM" in Seattle, built from parts so locale data can't change it. */
function noteTime(date: Date): string {
  const parts = noteTimeParts.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")} ${part("dayPeriod")}`;
}

/**
 * The TidyHQ contact note a staff check-in leaves: the event, who did it
 * (role, name and contact id) and when. A self check-in writes no note, so a
 * check-in without one was a self check-in.
 */
export function staffNoteText({
  eventId,
  eventName,
  staff,
  now,
}: {
  eventId: string;
  eventName: string | null;
  staff: StaffActor;
  now: Date;
}): string {
  return `Checked in to ${eventName ?? "an untitled event"} (${eventId}) by ${staff.role}: ${staff.name} (${staff.contactId}), ${noteTime(now)}`;
}
