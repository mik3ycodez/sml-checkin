import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { secureCookieOptions } from "@/lib/auth/cookieOptions";
import {
  newOAuthState,
  OAUTH_STATE_MAX_AGE_SECONDS,
} from "@/lib/auth/oauthState";
import { appOrigin } from "@/lib/auth/requestOrigin";
import { getTidyOAuth } from "@/lib/tidyhq";

/** `GET /auth/signin?returnTo=/checkin/x`: starts TidyHQ sign-in. */
export async function GET(request: NextRequest) {
  const saved = newOAuthState(request.nextUrl.searchParams.get("returnTo"));
  // Its own cookie per attempt, so starting again elsewhere (another tab, a
  // stray link) never breaks a sign-in already in progress.
  (await cookies()).set(saved.cookieName, saved.returnTo, {
    ...secureCookieOptions(),
    path: "/auth",
    maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
  });

  const redirectUri = new URL("/auth/callback", appOrigin(request.headers));
  redirect(
    getTidyOAuth().authorizeUrl({
      redirectUri: redirectUri.toString(),
      state: saved.state,
    }),
  );
}
