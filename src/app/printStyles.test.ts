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
});
