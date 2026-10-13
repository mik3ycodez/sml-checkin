/**
 * `value` if it is a path on this site, otherwise `fallback`. Stops the
 * sign-in redirect from sending a member to another site.
 *
 * Rejects absolute URLs, `//` or `\` anywhere (browsers treat `\` as `/`,
 * and `//host` means another site), any `..` segment (normalizing
 * `/..//evil.com` yields `//evil.com`), and whitespace or control characters,
 * which browsers may strip before parsing. Real return paths never need them.
 */
export function safeReturnTo(
  value: string | null | undefined,
  fallback = "/",
): string {
  if (!value || !value.startsWith("/")) return fallback;
  if (value.includes("//") || value.includes("\\")) return fallback;
  if (value.split("/").includes("..")) return fallback;
  if (/[\s\x00-\x1f\x7f]/.test(value)) return fallback;
  return value;
}
