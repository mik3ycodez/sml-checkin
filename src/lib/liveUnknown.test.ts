// Every unresolved unknown about live TidyHQ is marked `LIVE-UNKNOWN(<tag>)`
// in the source and has a go-live checklist item in the milestone 5 plan that
// names the same tag. This is the list: removing a marker without resolving
// it (or adding one without a checklist item) fails here, so it shows in
// review. When an unknown is resolved, delete its marker, its checklist item's
// tag and its entry below.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const KNOWN = [
  "checkin-window",
  "custom-field-format",
  "event-group-link",
  "group-put-response",
  "missing-issued-field",
  "missing-points-field",
  "oauth-token-exchange",
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)
      ? [path]
      : [];
  });
}

const markers = sourceFiles("src").flatMap((file) =>
  [...readFileSync(file, "utf8").matchAll(/LIVE-UNKNOWN\(([a-z-]+)\)/g)].map(
    (m) => ({ file, tag: m[1] }),
  ),
);

describe("LIVE-UNKNOWN markers", () => {
  it("are exactly the known list", () => {
    expect([...new Set(markers.map((m) => m.tag))].sort()).toEqual(KNOWN);
  });

  it("have no unnamed marker", () => {
    for (const file of sourceFiles("src")) {
      const text = readFileSync(file, "utf8");
      expect(text.match(/LIVE-UNKNOWN(?!\([a-z-]+\))/g), file).toBeNull();
    }
  });

  it.each(KNOWN)("%s has a go-live checklist item in the plan", (tag) => {
    const plan = readFileSync("docs/plans/milestone-5.md", "utf8");
    expect(plan).toContain(`LIVE-UNKNOWN(${tag})`);
  });
});
