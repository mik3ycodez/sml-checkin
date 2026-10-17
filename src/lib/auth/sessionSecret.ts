// The one rule for what `SESSION_SECRET` may be, shared by the session code
// (checked on every request) and the startup check, so raising the minimum in
// one place raises it in both. Kept apart from `session.ts`, which imports
// Next.js request APIs the startup check has no use for.

export const MIN_SESSION_SECRET_LENGTH = 32;

/**
 * Why `secret` can't sign sessions, or null if it can. Judged as given, not
 * trimmed: that is the value the signature uses.
 */
export function sessionSecretProblem(
  secret: string | undefined,
): "missing" | "too_short" | null {
  if (!secret) return "missing";
  if (secret.length < MIN_SESSION_SECRET_LENGTH) return "too_short";
  return null;
}
