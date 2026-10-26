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

describe("ci.yml e2e job", () => {
  it("runs in the Playwright image matching @playwright/test in package-lock.json", () => {
    const images = [
      ...ci.matchAll(/mcr\.microsoft\.com\/playwright:v(\S+?)-[a-z]+\b/g),
    ];
    expect(images, "exactly one Playwright image in ci.yml").toHaveLength(1);

    const image = images[0][1];
    const locked = lock.packages["node_modules/@playwright/test"]?.version;
    expect(
      image,
      `ci.yml uses the Playwright ${image} image but package-lock.json has ` +
        `@playwright/test ${locked}. Update both together: the image tag in ` +
        `ci.yml and @playwright/test in package.json and package-lock.json.`,
    ).toBe(locked);
  });

  it("has no playwright install step, since the image already has the browsers", () => {
    expect(ci).not.toMatch(/playwright\s+install/);
  });
});
