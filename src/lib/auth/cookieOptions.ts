import { configuredAppOrigin } from "./requestOrigin";

/**
 * Security flags shared by every cookie the app sets. `lax`, not `strict`:
 * TidyHQ's redirect back to /auth/callback is a cross-site navigation, and
 * the sign-in cookies must come along with it.
 *
 * `secure` follows APP_ORIGIN's scheme, not NODE_ENV: a production build
 * served over plain http (local end-to-end tests) would otherwise set cookies
 * that WebKit refuses to store. Real deployments must use https, which the
 * startup check enforces, so their cookies are always Secure.
 */
export function secureCookieOptions(
  env: { APP_ORIGIN?: string; NODE_ENV?: string } = process.env,
) {
  return {
    httpOnly: true,
    secure: configuredAppOrigin(env)?.startsWith("https:") ?? false,
    sameSite: "lax",
  } as const;
}
