import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

// The demo ships the standalone server (`.next/standalone/server.js`), not
// `next start`. These read the config files, since nothing else would notice
// them drifting apart: Next.js builds without `output`, and a mismatched
// `engines` only warns.

const root = join(__dirname, "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  engines: { node: string };
  scripts: Record<string, string>;
};

describe("standalone build", () => {
  it("builds a standalone server", () => {
    expect(nextConfig.output).toBe("standalone");
  });

  it("copies the static files in after building, since standalone leaves them out", () => {
    const script = pkg.scripts["build:standalone"];
    expect(script, "a build:standalone script").toBeDefined();
    // No trailing slash on the source: BSD cp (macOS) and GNU cp (Linux)
    // differ on it.
    expect(script).toMatch(
      /^next build && cp -R \.next\/static \.next\/standalone\/\.next\/$/,
    );
  });
});

describe("node version", () => {
  it("pins engines.node to the major version in .nvmrc", () => {
    const nvmrc = readFileSync(join(root, ".nvmrc"), "utf8").trim();
    expect(pkg.engines.node).toBe(`${nvmrc}.x`);
  });
});
