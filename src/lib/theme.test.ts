import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  THEME_BAR_COLORS,
  THEME_COOKIE,
  THEME_MAX_AGE_SECONDS,
  THEMES,
  parseTheme,
} from "./theme";

describe("parseTheme", () => {
  it("accepts the three choices", () => {
    for (const theme of THEMES) expect(parseTheme(theme)).toBe(theme);
    expect(THEMES).toEqual(["system", "light", "dark"]);
  });

  it("treats anything else as system", () => {
    for (const value of [
      undefined,
      null,
      "",
      "Dark",
      "LIGHT",
      " dark",
      "dark ",
      "auto",
      "dark;path=/",
      "<script>",
      "__proto__",
      "constructor",
    ]) {
      expect(parseTheme(value), String(value)).toBe("system");
    }
  });

  it("names the cookie and keeps it for a year", () => {
    expect(THEME_COOKIE).toBe("sml_theme");
    expect(THEME_MAX_AGE_SECONDS).toBe(365 * 24 * 60 * 60);
  });
});

// The browser bar matches --surface, the header, in each scheme. The CSS is the
// source of truth, so a color changed there fails here instead of drifting.
describe("THEME_BAR_COLORS", () => {
  const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8");
  const shade = (name: string) =>
    css.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, "i"))![1].toLowerCase();
  const surfaceIn = (block: string) =>
    css.match(
      new RegExp(`${block}[^{]*\\{[^}]*--surface:\\s*var\\((--c-[\\w-]+)\\)`),
    )![1];

  it("are the light and dark --surface colors", () => {
    expect(THEME_BAR_COLORS.light).toBe(shade("--c-white"));
    expect(THEME_BAR_COLORS.dark).toBe(
      shade(surfaceIn(':root\\[data-theme="dark"\\]')),
    );
  });
});
