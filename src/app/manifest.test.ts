import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "./manifest";

const publicFile = (src: string) => join(__dirname, "..", "..", "public", src);

describe("the web manifest", () => {
  const m = manifest();

  it("names the app and starts at the home page", () => {
    expect(m.name).toBe("SML Check-in");
    expect(m.short_name).toBe("SML");
    expect(m.start_url).toBe("/");
  });

  // Standalone gives the home-screen app its own cookie jar on iOS, apart from
  // Safari, where an OAuth round trip through TidyHQ can land in the wrong one.
  it("opens in the browser, not as a standalone app", () => {
    expect(m.display).toBe("browser");
  });

  it("lists the 192 and 512 icons and a maskable 512", () => {
    const icons = m.icons ?? [];
    const by = (sizes: string, purpose: string) =>
      icons.find((i) => i.sizes === sizes && (i.purpose ?? "any") === purpose);
    expect(by("192x192", "any")?.src).toBe("/brand/sml-icon-192.png");
    expect(by("512x512", "any")?.src).toBe("/brand/sml-icon-512.png");
    expect(by("512x512", "maskable")?.src).toBe(
      "/brand/sml-icon-maskable-512.png",
    );
    for (const icon of icons) {
      expect(icon.type).toBe("image/png");
      expect(existsSync(publicFile(icon.src)), icon.src).toBe(true);
    }
  });
});
