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

/**
 * Points total stored on the contact. 0 if the field is unset or blank; null
 * if it holds anything other than a plain whole number. Surrounding spaces and
 * commas are ignored, since they can't change the meaning ("1,234" is 1234).
 * Decimals, signs, and other text are unreadable rather than guessed at,
 * because this total is the source of truth and a wrong guess would be
 * written back.
 */
export function readPoints(
  contact: Pick<Contact, "custom_fields">,
): number | null {
  const value = contact.custom_fields[POINTS_FIELD_ID]?.value;
  if (value === undefined || value === null) return 0;
  if (typeof value !== "string") return null;
  const digits = value.trim().replaceAll(",", "");
  if (digits === "") return 0;
  if (!/^\d+$/.test(digits)) return null;
  const points = Number(digits);
  return Number.isSafeInteger(points) ? points : null;
}
