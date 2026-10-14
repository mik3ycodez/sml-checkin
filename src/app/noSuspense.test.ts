import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Enforces CLAUDE.md's "no <Suspense> on member pages" rule. Streamed
// Suspense content is revealed by a script, so with JavaScript off or failing
// the member would see the fallback forever. `loading.*` files wrap a route in
// an implicit Suspense boundary, so they count too.

const APP_DIR = __dirname;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(tsx?|jsx?)$/.test(entry.name) && !entry.name.includes(".test.")
      ? [path]
      : [];
  });
}

describe("src/app has no Suspense boundaries", () => {
  const files = sourceFiles(APP_DIR);

  it("finds the app's files (guards against scanning nothing)", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("has no loading.* files", () => {
    expect(files.filter((f) => /(^|[\\/])loading\.[jt]sx?$/.test(f))).toEqual(
      [],
    );
  });

  it("never uses Suspense", () => {
    // An import of it, or a `<Suspense` tag. Comments may still say the word.
    const uses = /import[^;]*\bSuspense\b|<Suspense\b/;
    const offenders = files.filter((f) => uses.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
