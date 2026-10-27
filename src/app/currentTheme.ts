import { cookies } from "next/headers";
import { cache } from "react";
import { parseTheme, THEME_COOKIE, type Theme } from "@/lib/theme";

/**
 * The member's theme choice from the `sml_theme` cookie, once per request (the
 * layout and its viewport both ask). `system` if there is no cookie, it holds
 * anything else, or it can't be read (outside a request).
 */
export const currentTheme = cache(async (): Promise<Theme> => {
  try {
    return parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  } catch {
    return "system";
  }
});
