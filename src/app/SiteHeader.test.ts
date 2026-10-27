import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { SiteHeader } from "./SiteHeader";

const html = renderToStaticMarkup(
  createElement(SiteHeader, { profile: null, returnTo: "/" }),
);

describe("SiteHeader", () => {
  it("is a header landmark that is hidden when printing", () => {
    expect(html).toMatch(/<header[^>]*print:hidden/);
  });

  it("links the logo and name to the home page as one link", () => {
    // The signed-out menu adds its own "Sign in" link, so look at the first.
    const home = html.slice(html.indexOf("<a "), html.indexOf("</a>"));
    expect(home).toMatch(/^<a[^>]*href="\/"/);
    expect(home).toContain("Seattle Men in Leather");
    expect(home.match(/<img/g)).toHaveLength(2);
  });

  it("puts the profile menu on the right, after the home link", () => {
    expect(html.indexOf("</a>")).toBeLessThan(html.indexOf("<details"));
    expect(html).toContain("justify-between");
  });

  it("shows the signed-in chip when given a profile", () => {
    const signedIn = renderToStaticMarkup(
      createElement(SiteHeader, {
        profile: { name: "Dante Ruiz", initials: "DR" },
        returnTo: "/me",
      }),
    );
    expect(signedIn).toContain("Account menu, signed in as Dante Ruiz");
    expect(html).not.toContain("Account menu");
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

  it("keeps the name text visible down to 360px, hiding it only below that", () => {
    expect(html).toMatch(/max-\[359px\]:sr-only/);
    expect(html).not.toMatch(/max-\[400px\]:sr-only/);
  });

  it("uses the surface and border tokens, with no shadow", () => {
    expect(html).toContain("bg-surface");
    expect(html).toContain("border-b");
    expect(html).toContain("border-border");
    // The bar itself has none (the open menu's panel does).
    expect(html.match(/<header[^>]*>/)![0]).not.toContain("shadow");
  });
});
