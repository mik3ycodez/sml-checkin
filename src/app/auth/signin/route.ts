import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import {
  newOAuthState,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_MAX_AGE_SECONDS,
  serializeOAuthState,
} from "@/lib/auth/oauthState";
import { getTidyOAuth } from "@/lib/tidyhq/oauth";

/** `GET /auth/signin?returnTo=/checkin/x`: starts TidyHQ sign-in. */
export async function GET(request: NextRequest) {
  const saved = newOAuthState(request.nextUrl.searchParams.get("returnTo"));
  (await cookies()).set(OAUTH_STATE_COOKIE, serializeOAuthState(saved), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // lax, not strict: TidyHQ's redirect back to the callback is a cross-site
    // navigation, and the cookie must come along with it.
    sameSite: "lax",
    path: "/auth",
    maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
  });

  const redirectUri = new URL("/auth/callback", request.nextUrl.origin);
  redirect(
    getTidyOAuth().authorizeUrl({
      redirectUri: redirectUri.toString(),
      state: saved.state,
    }),
  );
}
