import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { checkCallback } from "@/lib/auth/oauthState";
import { appOrigin } from "@/lib/auth/requestOrigin";
import { setSession } from "@/lib/auth/session";
import { getTidyClient, getTidyOAuth, isTidyError } from "@/lib/tidyhq";

/** `GET /auth/callback?code&state`: TidyHQ sends the member back here. */
export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const params = request.nextUrl.searchParams;
  const check = checkCallback(
    { code: params.get("code"), state: params.get("state") },
    (name) => cookieStore.get(name)?.value,
  );
  const errorPage = `/auth/error?returnTo=${encodeURIComponent(check.returnTo)}`;
  // An unknown state touches no cookies, so a stray or forged callback can't
  // break a sign-in that's still in progress.
  if (!check.ok) redirect(errorPage);
  // This attempt is used up, whatever happens next.
  cookieStore.delete({ name: check.cookieName, path: "/auth" });

  let contactId: string | null = null;
  try {
    const redirectUri = new URL("/auth/callback", appOrigin(request.headers));
    // The member's token is used only to identify them, then dropped.
    const token = await getTidyOAuth().exchangeCode({
      code: check.code,
      redirectUri: redirectUri.toString(),
    });
    contactId = (await getTidyClient().getMe(token)).id;
  } catch (error) {
    if (!isTidyError(error)) throw error;
  }
  // redirect() works by throwing, so it stays outside the try block.
  if (contactId === null) redirect(errorPage);

  await setSession(contactId);
  redirect(check.returnTo);
}
