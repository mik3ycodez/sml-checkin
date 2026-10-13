import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { secureCookieOptions } from "./cookieOptions";

// The member session holds only the TidyHQ contact id and an expiry, signed
// with HMAC-SHA256. The member's OAuth token is never stored.
//
// Token format: base64url(JSON {contactId, exp}) + "." + base64url(signature)

export const SESSION_COOKIE = "sml_session";
export const SESSION_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;
const MIN_SECRET_LENGTH = 32;

export type Session = {
  contactId: string;
  /** Expiry, in seconds since the Unix epoch. */
  exp: number;
};

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function signSession(
  contactId: string,
  secret: string,
  now: Date,
): string {
  if (!contactId) throw new Error("Cannot sign a session without a contact id");
  const exp = Math.floor(now.getTime() / 1000) + SESSION_MAX_AGE_SECONDS;
  const session: Session = { contactId, exp };
  const body = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

/** The session in `token`, or null if it is forged, expired, or malformed. */
export function verifySession(
  token: string | undefined,
  secret: string,
  now: Date,
): Session | null {
  const parts = token?.split(".");
  if (parts?.length !== 2) return null;
  const [body, signature] = parts;

  const expected = Buffer.from(sign(body, secret));
  const actual = Buffer.from(signature);
  if (
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  ) {
    return null;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    return null;
  }
  if (!isSession(payload)) return null;
  if (now.getTime() / 1000 >= payload.exp) return null;
  return { contactId: payload.contactId, exp: payload.exp };
}

function isSession(value: unknown): value is Session {
  if (typeof value !== "object" || value === null) return false;
  const { contactId, exp } = value as Record<string, unknown>;
  return typeof contactId === "string" && contactId !== "" &&
    typeof exp === "number" && Number.isFinite(exp);
}

/** `SESSION_SECRET` from the environment. Throws if it is missing or weak. */
export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET is not set. Add a random value to .env.local (see .env.example).",
    );
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `SESSION_SECRET must be at least ${MIN_SECRET_LENGTH} characters long.`,
    );
  }
  return secret;
}

/**
 * The signed-in member's session, or null. Works in Server Components.
 * Wrapped in React's cache() so the cookie is verified once per request, however
 * many components ask.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySession(token, getSessionSecret(), new Date());
});

/** Signs the member in. Only in Server Actions or Route Handlers. */
export async function setSession(contactId: string): Promise<void> {
  const token = signSession(contactId, getSessionSecret(), new Date());
  (await cookies()).set(SESSION_COOKIE, token, {
    ...secureCookieOptions(),
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/** Signs the member out. Only in Server Actions or Route Handlers. */
export async function clearSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
