// TidyHQ response shapes, trimmed to the fields this app uses.
// Field names follow the v2 OpenAPI spec: https://api.tidyhq.com/v2/openapi.json

export type CustomFieldType =
  | "string"
  | "text"
  | "boolean"
  | "checkbox_group"
  | "radio_group"
  | "file"
  | "dropdown"
  | "date";

export interface CustomField {
  id: string;
  title: string;
  type: CustomFieldType;
  value: string | boolean | string[] | Record<string, unknown>;
}

export interface Note {
  id: string;
  /** The contact who wrote the note. */
  author_id: string;
  text: string;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  display_name: string;
  first_name: string;
  last_name: string;
  nick_name: string;
  email_address: string;
  /** `active` or `inactive`. */
  status: string;
  member_since: string;
  created_at: string;
  updated_at: string;
  /** Answers keyed by custom field id. */
  custom_fields: Record<string, CustomField>;
  notes: Note[];
}

/**
 * `activated` | `partial` | `expired` | `pending` | `cancelled`.
 * TidyHQ treats `activated` and `partial` as active.
 */
export type MembershipState =
  "activated" | "partial" | "expired" | "pending" | "cancelled";

export interface Membership {
  id: string;
  state: MembershipState;
  /** Human-readable version of state. */
  status: string;
  membership_level_id: string;
  contact_id: string | null;
  /** `YYYY-MM-DD` */
  start_date: string | null;
  /** `YYYY-MM-DD` */
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface MembershipLevel {
  id: string;
  name: string;
  description: string | null;
}

export interface Event {
  id: string;
  name: string | null;
  start_at: string | null;
  end_at: string | null;
  body: string | null;
  location: string | null;
  public: boolean;
  archived: boolean;
  /**
   * The event's attendee group in TidyHQ, kept in step with its ticket
   * holders. Read but not used for check-in: see `eventGroups.ts`.
   */
  group_id?: string | null;
  /**
   * The group whose members attended, as this app links it: the contact group
   * a check-in writes to and reads. Not a TidyHQ field. The mock fills it;
   * `HttpTidyClient` leaves it unset until the link is verified (see
   * `eventGroups.ts`), so a live event has no group and check-in refuses it.
   */
  attendance_group_id?: string | null;
  /** Set when the event belongs to another organisation and was shared in. */
  shared_from?: { id: string; name: string } | null;
  created_at: string;
  updated_at: string;
}

/**
 * Admin-set check-in open/close times for an event (ISO timestamps). Which
 * TidyHQ field holds these is unknown until live access.
 */
export interface EventCheckinWindow {
  opens_at: string;
  closes_at: string;
}

/**
 * A TidyHQ group, as the v1 API describes it (`GET /v1/contacts/{id}/groups`).
 * v1 sends no `archived` flag or `updated_at`, so they aren't here: nothing may
 * rely on data live TidyHQ doesn't provide.
 */
export interface Group {
  /** v1 sends a number; we keep every id a string. */
  id: string;
  label: string;
  description: string;
  /** How many contacts are in this group (v1's `contacts_count`). */
  size: number;
  /** ISO 8601 (v1 sends `2012-12-16 21:01:22 +0000`; the client converts). */
  created_at: string;
}

/**
 * Body for `PATCH /v2/contacts/{id}`, a `Contact` in the v2 spec. Build
 * custom_fields via customFields.ts. Each answer is the spec's `Custom-Field`
 * reduced to its `value`: nothing else about the field is ever sent.
 */
export interface ContactPatch {
  custom_fields?: Record<string, { value: string }>;
}
