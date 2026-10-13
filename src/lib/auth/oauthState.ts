import { randomBytes } from "node:crypto";
import { safeReturnTo } from "./returnTo";

// Between /auth/signin and /auth/callback, a short-lived httpOnly cookie holds
// a random `state` (OAuth's guard against forged callbacks) and the page to
// return to. The callback only signs the member in if TidyHQ hands back the
// same state.

export const OAUTH_STATE_COOKIE = "sml_oauth_state";
export const OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;

export type OAuthState = { state: string; returnTo: string };

export function newOAuthState(returnTo: string | null | undefined): OAuthState {
  return {
    state: randomBytes(32).toString("base64url"),
    returnTo: safeReturnTo(returnTo),
  };
}

export function serializeOAuthState(saved: OAuthState): string {
  return JSON.stringify(saved);
}

/** The saved state, or null if the cookie is missing or malformed. */
export function parseOAuthState(value: string | undefined): OAuthState | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value ?? "");
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { state, returnTo } = parsed as Record<string, unknown>;
  if (typeof state !== "string" || !state) return null;
  return {
    state,
    returnTo: safeReturnTo(typeof returnTo === "string" ? returnTo : null),
  };
}

export type CallbackCheck =
  | { ok: true; code: string; returnTo: string }
  | { ok: false };

/** Whether the callback's `state` matches the saved one and carries a code. */
export function checkCallback(
  params: { code: string | null; state: string | null },
  savedCookie: string | undefined,
): CallbackCheck {
  const saved = parseOAuthState(savedCookie);
  if (!saved || !params.code || params.state !== saved.state) {
    return { ok: false };
  }
  return { ok: true, code: params.code, returnTo: saved.returnTo };
}
