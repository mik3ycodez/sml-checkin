export const THEME_COOKIE = "sml_theme";
export const THEME_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/** `system` follows the device; the other two force a theme. */
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

/** The theme in a cookie value. Anything else, or no cookie, is `system`. */
export function parseTheme(value: string | null | undefined): Theme {
  return THEMES.find((theme) => theme === value) ?? "system";
}

/**
 * The browser bar color for each forced theme: the header's `--surface` in
 * that theme (`theme.test.ts` checks them against `globals.css`).
 */
export const THEME_BAR_COLORS = {
  light: "#ffffff",
  dark: "#171717",
} as const;
