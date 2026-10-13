import type { Contact, ContactPatch } from "./types";

// The only place that knows the custom-field request format.
//
// Unknown until live access: the exact PATCH body TidyHQ expects for custom
// fields. TidyHQ has no number field type, so points are stored as a string.

/** Custom field id of the member's points total (read-only to members). */
export const POINTS_FIELD_ID = "cf_sml_points";

export function buildPointsPatch(total: number): ContactPatch {
  return { custom_fields: { [POINTS_FIELD_ID]: String(total) } };
}

/** Points total stored on the contact, or 0 if unset or unreadable. */
export function readPoints(contact: Pick<Contact, "custom_fields">): number {
  const value = contact.custom_fields[POINTS_FIELD_ID]?.value;
  const points = typeof value === "string" ? Number.parseInt(value, 10) : NaN;
  return Number.isNaN(points) ? 0 : points;
}
