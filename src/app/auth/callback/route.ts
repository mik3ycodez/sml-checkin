import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { checkCallback, OAUTH_STATE_COOKIE } from "@/lib/auth/oauthState";
import { setSession } from "@/lib/auth/session";
import { getTidyClient, TidyError } from "@/lib/tidyhq";
import { getTidyOAuth } from "@/lib/tidyhq/oauth";

/** `GET /auth/callback?code&state`: TidyHQ sends the member back here. */
export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const params = request.nextUrl.searchParams;
  const check = checkCallback(
    { code: params.get("code"), state: params.get("state") },
    cookieStore.get(OAUTH_STATE_COOKIE)?.value,
  );
  // One use only, whatever happens next.
  cookieStore.delete({ name: OAUTH_STATE_COOKIE, path: "/auth" });
  if (!check.ok) redirect("/auth/error");

  let contactId: string;
  try {
    const redirectUri = new URL("/auth/callback", request.nextUrl.origin);
    // The member's token is used only to identify them, then dropped.
    const token = await getTidyOAuth().exchangeCode({
      code: check.code,
      redirectUri: redirectUri.toString(),
    });
    contactId = (await getTidyClient().getMe(token)).id;
  } catch (error) {
    if (!(error instanceof TidyError)) throw error;
    contactId = "";
  }
  // redirect() works by throwing, so it stays outside the try block.
  if (!contactId) {
    redirect(`/auth/error?returnTo=${encodeURIComponent(check.returnTo)}`);
  }

  await setSession(contactId);
  redirect(check.returnTo);
}
