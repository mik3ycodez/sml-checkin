import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { SiteHeader } from "./SiteHeader";

const html = renderToStaticMarkup(createElement(SiteHeader));

describe("SiteHeader", () => {
  it("is a header landmark that is hidden when printing", () => {
    expect(html).toMatch(/<header[^>]*print:hidden/);
  });

  it("links the logo and name to the home page as one link", () => {
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toMatch(/<a[^>]*href="\/"/);
    expect(html).toContain("Seattle Men in Leather");
  });

  it("renders both logos with the classes the theme CSS swaps", () => {
    expect(html).toMatch(
      /<img[^>]*src="\/brand\/sml-logo-black\.png"[^>]*logo-for-light|<img[^>]*logo-for-light[^>]*src="\/brand\/sml-logo-black\.png"/,
    );
    expect(html).toMatch(
      /<img[^>]*src="\/brand\/sml-logo-white\.png"[^>]*logo-for-dark|<img[^>]*logo-for-dark[^>]*src="\/brand\/sml-logo-white\.png"/,
    );
    for (const name of ["black", "white"]) {
      expect(
        existsSync(
          join(
            __dirname,
            "..",
            "..",
            "public",
            "brand",
            `sml-logo-${name}.png`,
          ),
        ),
      ).toBe(true);
    }
  });

  it("names the home link once: the logos are decorative, the text names it", () => {
    // alt="" on both images, so the link's name is the span's text alone
    // (visible, or sr-only on narrow phones), never announced twice.
    expect(html.match(/<img[^>]*alt=""/g)).toHaveLength(2);
    expect(html.match(/Seattle Men in Leather/g)).toHaveLength(1);
  });

  it("keeps the name text visible, hiding it only on narrow phones", () => {
    expect(html).toMatch(/max-\[400px\]:sr-only/);
  });

  it("uses the surface and border tokens, with no shadow", () => {
    expect(html).toContain("bg-surface");
    expect(html).toContain("border-b");
    expect(html).toContain("border-border");
    expect(html).not.toContain("shadow");
  });
});
