import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// src/lib is the app's logic and must not depend on the route layer in
// src/app (pages, screens, paths). Dependencies point one way: app → lib.

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !entry.name.includes(".test.")
      ? [path]
      : [];
  });
}

describe("src/lib doesn't import from src/app", () => {
  const files = sourceFiles(__dirname);

  it("finds lib's files (guards against scanning nothing)", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("has no import of @/app or a relative path into app", () => {
    const offenders = files.filter((file) =>
      /from\s+["'](@\/app\/|(\.\.\/)+app\/)/.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
