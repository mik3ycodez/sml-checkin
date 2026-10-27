import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("next.config", () => {
  // Browsers ask for /favicon.ico on their own, whatever the page's <link>s say.
  // A rewrite answers from the locked icon in public/brand; a route would make
  // the page dynamic and a copy would sit outside the lock.
  it("answers /favicon.ico with the locked 192 icon", async () => {
    const rewrites = await nextConfig.rewrites?.();
    const list = Array.isArray(rewrites)
      ? rewrites
      : (rewrites?.beforeFiles ?? []);
    expect(list).toContainEqual({
      source: "/favicon.ico",
      destination: "/brand/sml-icon-192.png",
    });
  });
});
