/**
 * `value` if it is a path on this site, otherwise `fallback`. Stops the
 * sign-in redirect from sending a member to another site.
 *
 * Rejects `//host` and `/\host` (browsers treat `\` as `/`, so both mean
 * "another site"), absolute URLs, and anything with whitespace or control
 * characters, which browsers may strip before parsing.
 */
export function safeReturnTo(
  value: string | null | undefined,
  fallback = "/",
): string {
  if (!value || !value.startsWith("/")) return fallback;
  if (value[1] === "/" || value[1] === "\\") return fallback;
  if (/[\s\x00-\x1f\x7f]/.test(value)) return fallback;
  return value;
}
