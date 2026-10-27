import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Paper is white: browsers drop backgrounds when printing, so dark mode's
// light-gray text would print faint. The print block must come after the
// dark-mode one so it wins, and must set the same variables Tailwind reads.

const css = readFileSync(join(__dirname, "globals.css"), "utf8");

describe("globals.css print styles", () => {
  const printAt = css.indexOf("@media print");
  const darkAt = css.indexOf("prefers-color-scheme: dark");
  const printBlock = css.slice(printAt, css.indexOf("}\n}", printAt) + 3);

  it("has a print block after the dark-mode block", () => {
    expect(printAt).toBeGreaterThan(-1);
    expect(printAt).toBeGreaterThan(darkAt);
  });

  it("forces the light colors and color scheme", () => {
    expect(printBlock).toMatch(/--background:\s*#ffffff/);
    expect(printBlock).toMatch(/--foreground:\s*#171717/);
    expect(printBlock).toMatch(/color-scheme:\s*light/);
  });

  it("forces every token, not just the first two", () => {
    expect(printBlock).toMatch(/--accent:\s*#636363/);
    expect(printBlock).toMatch(/--on-accent:\s*#ffffff/);
    expect(printBlock).toMatch(/--surface:\s*#ffffff/);
    expect(printBlock).toMatch(/--border:\s*#e5e5e5/);
  });

  // Both dark selectors have specificity (0,2,0): `:root:not([data-theme=
  // "light"])` (no attribute set, the usual case) and `:root[data-theme=
  // "dark"]`. A bare `:root` (0,1,0) loses to the first, so print was dark.
  it("is as specific as the dark selectors, so it beats them", () => {
    expect(printBlock).toMatch(/:root:root\s*{/);
    expect(printBlock).not.toMatch(/(^|[\s,]):root\s*[,{]/);
  });
});

describe("globals.css theme tokens", () => {
  const tokens = (block: string) => ({
    accent: block.match(/--accent:\s*(#\w+)/)?.[1],
    onAccent: block.match(/--on-accent:\s*(#\w+)/)?.[1],
    surface: block.match(/--surface:\s*(#\w+)/)?.[1],
    border: block.match(/--border:\s*(#\w+)/)?.[1],
  });
  const lightBlock = css.slice(css.indexOf(":root {"), css.indexOf("}"));
  const darkMedia = css.indexOf("@media (prefers-color-scheme: dark)");
  const darkBlock = css.slice(darkMedia, css.indexOf("}\n}", darkMedia));
  const forcedAt = css.indexOf(':root[data-theme="dark"] {');
  const forcedBlock = css.slice(forcedAt, css.indexOf("}", forcedAt));

  it("has SML's accent and the surface and border tokens in light", () => {
    expect(tokens(lightBlock)).toEqual({
      accent: "#636363",
      onAccent: "#ffffff",
      surface: "#ffffff",
      border: "#e5e5e5",
    });
  });

  const dark = {
    accent: "#a3a3a3",
    onAccent: "#0a0a0a",
    surface: "#171717",
    border: "#2e2e2e",
  };

  it("follows the device in dark unless the page is forced light", () => {
    expect(darkBlock).toContain(':root:not([data-theme="light"])');
    expect(tokens(darkBlock)).toEqual(dark);
  });

  it("can be forced dark with data-theme", () => {
    expect(forcedAt).toBeGreaterThan(-1);
    expect(tokens(forcedBlock)).toEqual(dark);
  });

  it("exposes the tokens as Tailwind colors", () => {
    for (const name of ["accent", "on-accent", "surface", "border"]) {
      expect(css).toContain(`--color-${name}: var(--${name})`);
    }
  });
});

describe("globals.css logo swap", () => {
  it("hides the dark-theme logo by default", () => {
    expect(css).toMatch(/\.logo-for-dark\s*{\s*display:\s*none/);
  });

  it("swaps logos with the same selectors as the colors", () => {
    const light = ':root:not([data-theme="light"])';
    expect(css).toContain(`${light} .logo-for-light`);
    expect(css).toContain(`${light} .logo-for-dark`);
    expect(css).toContain(':root[data-theme="dark"] .logo-for-light');
    expect(css).toContain(':root[data-theme="dark"] .logo-for-dark');
  });

  it("keeps the swap out of a <picture>, which ignores a manual choice", () => {
    const header = readFileSync(join(__dirname, "SiteHeader.tsx"), "utf8");
    expect(header).not.toContain("<picture");
  });
});
