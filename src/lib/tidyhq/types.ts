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

export interface Group {
  id: string;
  label: string;
  description: string;
  /** How many contacts are in this group. */
  size: number;
  /**
   * Past events' attendance groups are archived in the TidyHQ admin screens
   * but still list the contact's membership. Optional: no app code reads it,
   * and the v1 response's exact shape is unconfirmed. Only the mock sets it.
   */
  archived?: boolean;
  created_at: string;
  updated_at: string;
}

/** Body for `PATCH /v2/contacts/{id}`. Build custom_fields via customFields.ts. */
export interface ContactPatch {
  custom_fields?: Record<string, string>;
}
