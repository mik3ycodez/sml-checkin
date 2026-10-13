/**
 * Security flags shared by every cookie the app sets. `lax`, not `strict`:
 * TidyHQ's redirect back to /auth/callback is a cross-site navigation, and
 * the sign-in cookies must come along with it.
 */
export function secureCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  } as const;
}
