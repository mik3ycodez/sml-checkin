import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { secureCookieOptions } from "@/lib/auth/cookieOptions";
import {
  newOAuthState,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_MAX_AGE_SECONDS,
  serializeOAuthState,
} from "@/lib/auth/oauthState";
import { appOrigin } from "@/lib/auth/requestOrigin";
import { getTidyOAuth } from "@/lib/tidyhq";

/** `GET /auth/signin?returnTo=/checkin/x`: starts TidyHQ sign-in. */
export async function GET(request: NextRequest) {
  const saved = newOAuthState(request.nextUrl.searchParams.get("returnTo"));
  (await cookies()).set(OAUTH_STATE_COOKIE, serializeOAuthState(saved), {
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
