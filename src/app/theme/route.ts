import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { secureCookieOptions } from "@/lib/auth/cookieOptions";
import { appOrigin, isSameSiteRequest } from "@/lib/auth/requestOrigin";
import { safeReturnTo } from "@/lib/auth/returnTo";
import { THEME_COOKIE, THEME_MAX_AGE_SECONDS, THEMES } from "@/lib/theme";

/**
 * `POST /theme`: saves the member's System / Light / Dark choice in a cookie,
 * then goes back to the form's `returnTo` page on this site (home by default).
 * A plain form post, so it works without JavaScript. Unlike Sign out, it returns
 * to the exact page: nobody is changing members, so a check-in screen stays put.
 * A value that isn't one of the three is ignored (the page just reloads).
 */
export async function POST(request: NextRequest) {
  const origin = appOrigin(request.headers);
  // Another site must not be able to change the theme with a hidden form.
  if (!isSameSiteRequest(request.headers, origin)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const form = await formData(request);
  const theme = THEMES.find((t) => t === form?.get("theme"));
  if (theme) {
    (await cookies()).set(THEME_COOKIE, theme, {
      ...secureCookieOptions(),
      path: "/",
      maxAge: THEME_MAX_AGE_SECONDS,
    });
  }
  const requested = form?.get("returnTo");
  const returnTo = safeReturnTo(
    typeof requested === "string" ? requested : null,
  );
  // 303 so the browser follows with a GET, not a repeat POST.
  return NextResponse.redirect(new URL(returnTo, origin), 303);
}

/** The form post's fields, or null if there's no form body. */
async function formData(request: NextRequest) {
  try {
    return await request.formData();
  } catch {
    return null;
  }
}
