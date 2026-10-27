import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("./globals.css", () => ({}));

import { existsSync } from "node:fs";
import { join } from "node:path";
import RootLayout, { metadata } from "./layout";

describe("the root layout's icons", () => {
  const icons = metadata.icons as {
    icon: { url: string }[];
    apple: { url: string }[];
  };

  it("uses the SML icons from /brand, not Next's default favicon", () => {
    expect(icons.icon.map((i) => i.url)).toEqual([
      "/brand/sml-icon-192.png",
      "/brand/sml-icon-512.png",
    ]);
    expect(icons.apple.map((i) => i.url)).toEqual([
      "/brand/apple-touch-icon.png",
    ]);
    expect(existsSync(join(__dirname, "favicon.ico"))).toBe(false);
  });

  it("points only at files that exist in public/", () => {
    for (const { url } of [...icons.icon, ...icons.apple]) {
      expect(existsSync(join(__dirname, "..", "..", "public", url)), url).toBe(
        true,
      );
    }
  });
});

describe("the root layout's demo banner", () => {
  afterEach(() => vi.unstubAllEnvs());

  const render = async () =>
    renderToStaticMarkup(
      await RootLayout({ children: createElement("p", null, "Page body") }),
    );

  it("renders no DemoBanner when DEMO_MODE is off", async () => {
    for (const value of ["", "off"]) {
      vi.stubEnv("DEMO_MODE", value);
      const html = await render();
      expect(html).toContain("Page body");
      expect(html).not.toContain("Demo data");
      expect(html).not.toContain("Demo walkthrough");
    }
  });

  it("renders the DemoBanner when DEMO_MODE is on", async () => {
    vi.stubEnv("DEMO_MODE", "on");
    const html = await render();
    expect(html).toContain("Demo data");
    expect(html).toContain("Page body");
  });
});
