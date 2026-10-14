import { randomBytes } from "node:crypto";
import { safeReturnTo } from "./returnTo";

// Between /auth/signin and /auth/callback, a short-lived httpOnly cookie
// remembers the page to return to. Each sign-in attempt gets its own cookie,
// named after its random `state` (OAuth's guard against forged callbacks), so
// sign-ins started in two tabs don't overwrite each other. The callback only
// signs the member in if TidyHQ hands back a state we have a cookie for.

export const OAUTH_STATE_COOKIE_PREFIX = "sml_oauth_";
export const OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;

/** 32 random bytes, base64url: exactly 43 cookie-safe characters. */
const STATE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type OAuthState = {
  state: string;
  returnTo: string;
  cookieName: string;
};

export function newOAuthState(returnTo: string | null | undefined): OAuthState {
  const state = randomBytes(32).toString("base64url");
  return {
    state,
    returnTo: safeReturnTo(returnTo),
    cookieName: `${OAUTH_STATE_COOKIE_PREFIX}${state}`,
  };
}

/** The cookie for `state`, or null if it isn't a state we could have made. */
export function oauthStateCookieName(state: string | null): string | null {
  if (!state || !STATE_PATTERN.test(state)) return null;
  return `${OAUTH_STATE_COOKIE_PREFIX}${state}`;
}

export type CallbackCheck =
  | { ok: true; code: string; returnTo: string; cookieName: string }
  | { ok: false; returnTo: string };

/**
 * Whether the callback's `state` belongs to a sign-in we started and carries
 * a code. `returnTo` is the saved page when the state is known (even if the
 * code is missing), otherwise `/`.
 */
export function checkCallback(
  params: { code: string | null; state: string | null },
  readCookie: (name: string) => string | undefined,
): CallbackCheck {
  const cookieName = oauthStateCookieName(params.state);
  const saved = cookieName ? readCookie(cookieName) : undefined;
  if (!cookieName || saved === undefined) return { ok: false, returnTo: "/" };
  const returnTo = safeReturnTo(saved);
  if (!params.code) return { ok: false, returnTo };
  return { ok: true, code: params.code, returnTo, cookieName };
}
