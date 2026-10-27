import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// CI's e2e job runs in the official Playwright image, which carries the
// browsers and their system libraries, so nothing is installed through apt.
// The browsers in the image must be the ones @playwright/test expects.

const root = join(__dirname, "..");
const ci = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
const lock = JSON.parse(
  readFileSync(join(root, "package-lock.json"), "utf8"),
) as {
  packages: Record<string, { version: string }>;
};

// The tag of every `image: mcr.microsoft.com/playwright:v<tag>-<os>` line.
// Comments, and any other form of the line, are not images. No YAML parser:
// the line shape is the contract.
function playwrightImageTags(yaml: string): string[] {
  const tags: string[] = [];
  for (const line of yaml.split("\n")) {
    const match = /^\s*image:\s*(\S+)\s*$/.exec(line);
    if (!match) continue;
    const image = /^mcr\.microsoft\.com\/playwright:v(\S+)-(noble|jammy)$/.exec(
      match[1],
    );
    if (image) tags.push(image[1]);
  }
  return tags;
}

describe("playwrightImageTags", () => {
  it("reads the tag from an image line", () => {
    expect(
      playwrightImageTags(
        "    container:\n      image: mcr.microsoft.com/playwright:v1.64.0-noble\n",
      ),
    ).toEqual(["1.64.0"]);
  });

  it("ignores a commented-out image line", () => {
    expect(
      playwrightImageTags(
        "      # image: mcr.microsoft.com/playwright:v1.60.0-noble\n" +
          "      image: mcr.microsoft.com/playwright:v1.64.0-noble\n",
      ),
    ).toEqual(["1.64.0"]);
  });

  it("keeps a prerelease tag whole", () => {
    expect(
      playwrightImageTags(
        "      image: mcr.microsoft.com/playwright:v1.65.0-beta-123-noble\n",
      ),
    ).toEqual(["1.65.0-beta-123"]);
  });
});

describe("ci.yml e2e job", () => {
  it("runs in the Playwright image matching Playwright in package-lock.json", () => {
    const tags = playwrightImageTags(ci);
    expect(tags, "exactly one Playwright image in ci.yml").toHaveLength(1);

    // The browsers in the image belong to playwright-core, which the other
    // two pin, but an override or a nested copy could make them differ.
    for (const name of ["@playwright/test", "playwright", "playwright-core"]) {
      const locked = lock.packages[`node_modules/${name}`]?.version;
      expect(
        tags[0],
        `ci.yml uses the Playwright ${tags[0]} image but package-lock.json ` +
          `has ${name} ${locked}. Update both together: the image tag in ` +
          `ci.yml and @playwright/test in package.json and package-lock.json.`,
      ).toBe(locked);
    }
  });

  it("checks the image against the lockfile before anything slow", () => {
    const steps = ci.slice(ci.indexOf("  e2e:"));
    expect(steps).toMatch(
      /- run: npm ci\n(\s*#.*\n)*\s*- run: npx vitest run src\/ciWorkflow\.test\.ts\n/,
    );
  });

  it("has no playwright install step, since the image already has the browsers", () => {
    expect(ci).not.toMatch(/playwright\s+install/);
  });
});
