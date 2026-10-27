// Turns TidyHQ's JSON into our types. Written from the published specs
// (v2: https://api.tidyhq.com/v2/openapi.json, v1: .../v1/openapi.json), and
// careful about what live data can do that the specs don't promise: null and
// missing fields, numeric ids, v1's `2012-12-16 21:01:22 +0000` times.
//
// `tidyRequest` has already checked each record is an object with an id.

import type {
  Contact,
  CustomField,
  CustomFieldType,
  Event,
  Group,
  Membership,
  MembershipLevel,
  MembershipState,
  Note,
} from "../types";

type Raw = Record<string, unknown>;

const isObject = (v: unknown): v is Raw =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const text = (v: unknown): string => (typeof v === "string" ? v : "");

const textOrNull = (v: unknown): string | null =>
  typeof v === "string" ? v : null;

/** Ids are strings in v2 but numbers in places in v1: we always use strings. */
function idText(v: unknown): string {
  return typeof v === "string" || typeof v === "number" ? String(v) : "";
}

const idOrNull = (v: unknown): string | null => idText(v) || null;

/** v1 writes times as `2012-12-16 21:01:22 +0000`; anything else passes through. */
export function fromV1Time(v: unknown): string {
  const value = text(v);
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/.exec(
    value,
  );
  if (!m) return value;
  const ms = Date.parse(`${m[1]}T${m[2]}${m[3]}:${m[4]}`);
  return Number.isNaN(ms) ? value : new Date(ms).toISOString();
}

/**
 * v2 keys custom fields by id; v1 lists them. A field with no `value` is left
 * out (v1's list has none), never filled in, so a missing points field stays
 * visibly missing. A null value is an unanswered field and reads as blank.
 */
function parseCustomFields(raw: unknown): Record<string, CustomField> {
  const entries: Array<[string, unknown]> = Array.isArray(raw)
    ? raw.map((entry) => [isObject(entry) ? idText(entry.id) : "", entry])
    : isObject(raw)
      ? Object.entries(raw)
      : [];
  const fields: Record<string, CustomField> = {};
  for (const [key, entry] of entries) {
    if (key === "" || !isObject(entry) || !("value" in entry)) continue;
    fields[key] = {
      id: idText(entry.id) || key,
      title: text(entry.title),
      type: (text(entry.type) || "string") as CustomFieldType,
      value: (entry.value ?? "") as CustomField["value"],
    };
  }
  return fields;
}

/** A `Note`; `tidyRequest` has checked it is an object with an id. */
export function parseNote(raw: unknown): Note {
  const n = raw as Raw;
  return {
    id: idText(n.id),
    author_id: idText(n.author_id),
    text: text(n.text),
    created_at: text(n.created_at),
    updated_at: text(n.updated_at),
  };
}

function parseNotes(raw: unknown): Note[] {
  return Array.isArray(raw) ? raw.filter(isObject).map(parseNote) : [];
}

export function parseContact(raw: unknown, version: "v1" | "v2"): Contact {
  const r = raw as Raw;
  const time = version === "v1" ? fromV1Time : text;
  // LIVE-UNKNOWN(profile-image): the spec gives no format for either field, or
  // what a contact with no photo returns. Anything blank or not a string is
  // left out; the header then shows initials. Whether a placeholder URL comes
  // back for "no photo" is checked at go-live.
  const profileImage = text(r.profile_image);
  const initials = text(r.initials);
  return {
    id: idText(r.id),
    display_name: text(r.display_name),
    first_name: text(r.first_name),
    last_name: text(r.last_name),
    nick_name: text(r.nick_name),
    email_address: text(r.email_address),
    status: text(r.status),
    member_since: text(r.member_since),
    ...(profileImage && { profile_image: profileImage }),
    ...(initials && { initials }),
    created_at: time(r.created_at),
    updated_at: time(r.updated_at),
    custom_fields: parseCustomFields(r.custom_fields),
    notes: parseNotes(r.notes),
  };
}

const MEMBERSHIP_STATES: readonly string[] = [
  "activated",
  "partial",
  "expired",
  "pending",
  "cancelled",
] satisfies MembershipState[];

/**
 * A state we don't know becomes `pending`, which never counts as a
 * membership, so a surprise value can only refuse check-in, never allow it.
 */
export function parseMembership(raw: unknown): Membership {
  const r = raw as Raw;
  const id = idText(r.id);
  let state = text(r.state);
  if (!MEMBERSHIP_STATES.includes(state)) {
    console.warn(
      "tidyhq membership has an unknown state; treating as pending",
      {
        membership: id,
        state: state.slice(0, 40),
      },
    );
    state = "pending";
  }
  return {
    id,
    state: state as MembershipState,
    status: text(r.status),
    membership_level_id: idText(r.membership_level_id),
    contact_id: idOrNull(r.contact_id),
    start_date: textOrNull(r.start_date),
    end_date: textOrNull(r.end_date),
    created_at: text(r.created_at),
    updated_at: text(r.updated_at),
  };
}

export function parseMembershipLevel(raw: unknown): MembershipLevel {
  const r = raw as Raw;
  return {
    id: idText(r.id),
    name: text(r.name),
    description: textOrNull(r.description),
  };
}

/**
 * `archived` is only sent when the token can see the organisation's events, so
 * an event without it is treated as archived: check-in refuses it, rather than
 * a possibly-archived event staying open.
 */
export function parseEvent(raw: unknown): Event {
  const r = raw as Raw;
  const event: Event = {
    id: idText(r.id),
    name: textOrNull(r.name),
    start_at: textOrNull(r.start_at),
    end_at: textOrNull(r.end_at),
    body: textOrNull(r.body),
    location: textOrNull(r.location),
    public: r.public === true,
    archived: r.archived !== false,
    created_at: text(r.created_at),
    updated_at: text(r.updated_at),
  };
  if ("group_id" in r) event.group_id = idOrNull(r.group_id);
  if ("shared_from" in r) {
    event.shared_from = isObject(r.shared_from)
      ? { id: idText(r.shared_from.id), name: text(r.shared_from.name) }
      : null;
  }
  return event;
}

/** v1 only: `contacts_count` is our `size`, and there is no archived flag. */
export function parseGroup(raw: unknown): Group {
  const r = raw as Raw;
  return {
    id: idText(r.id),
    label: text(r.label),
    description: text(r.description),
    size: typeof r.contacts_count === "number" ? r.contacts_count : 0,
    created_at: fromV1Time(r.created_at),
  };
}
