import type { Contact } from "./types";

/** What to show for a contact TidyHQ has no usable name for. */
export const UNNAMED = "Unnamed member";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The one place that turns a TidyHQ contact into a name to show. Uses the
 * display name; if it's blank, first and last name; if those are blank too,
 * `UNNAMED`. TidyHQ is only trusted to send strings: a null or missing field
 * (which live data may have, though the types say string) is treated as blank,
 * so one odd contact can't break a page, and never prints as "null".
 */
export function contactName(
  contact: Partial<Pick<Contact, "display_name" | "first_name" | "last_name">>,
): string {
  const display = text(contact.display_name);
  if (display) return display;
  const full = [text(contact.first_name), text(contact.last_name)]
    .filter(Boolean)
    .join(" ");
  return full || UNNAMED;
}
