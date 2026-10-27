import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { secureCookieOptions } from "@/lib/auth/cookieOptions";
import { handleFormPost } from "@/lib/auth/formPost";
import { isTheme, THEME_COOKIE, THEME_MAX_AGE_SECONDS } from "@/lib/theme";

/**
 * `POST /theme`: saves the member's System / Light / Dark choice in a cookie,
 * then goes back to the form's `returnTo` page on this site (home by default).
 * A plain form post, so it works without JavaScript. Unlike Sign out, it returns
 * to the exact page: nobody is changing members, so a check-in screen stays put.
 * A value that isn't one of the three is ignored (the page just reloads).
 */
export function POST(request: NextRequest) {
  return handleFormPost(request, async (field) => {
    const theme = field("theme");
    if (!isTheme(theme)) return;
    (await cookies()).set(THEME_COOKIE, theme, {
      ...secureCookieOptions(),
      path: "/",
      maxAge: THEME_MAX_AGE_SECONDS,
    });
  });
}
