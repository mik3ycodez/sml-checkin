import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ theme: undefined as string | undefined }));

vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/headers", () => ({
  // No request headers here, so the header falls back to home.
  headers: async () => {
    throw new Error("outside a request");
  },
  cookies: async () => ({
    get: (name: string) =>
      name === "sml_theme" && state.theme !== undefined
        ? { name, value: state.theme }
        : undefined,
  }),
}));
vi.mock("./globals.css", () => ({}));

import { existsSync } from "node:fs";
import { join } from "node:path";
import RootLayout, { generateViewport, metadata } from "./layout";

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

describe("the root layout's viewport", () => {
  afterEach(() => {
    state.theme = undefined;
  });

  // Matches --surface, the header's color, in each scheme (dark surface is
  // #171717, not the darker dark background).
  it("sets the browser bar color for light and dark by default", async () => {
    expect((await generateViewport()).themeColor).toEqual([
      { media: "(prefers-color-scheme: light)", color: "#ffffff" },
      { media: "(prefers-color-scheme: dark)", color: "#171717" },
    ]);
  });

  it("follows the device for system and for a bad cookie", async () => {
    for (const value of ["system", "purple", ""]) {
      state.theme = value;
      expect((await generateViewport()).themeColor).toHaveLength(2);
    }
  });

  // A forced theme must not leave the bar showing the other scheme: one entry,
  // no media query to let the device override it.
  it.each([
    ["light", "#ffffff"],
    ["dark", "#171717"],
  ])(
    "gives one theme-color, with no media, when forced %s",
    async (theme, color) => {
      state.theme = theme;
      expect((await generateViewport()).themeColor).toEqual(color);
    },
  );

  it("keeps the rest of the viewport", async () => {
    state.theme = "dark";
    expect(await generateViewport()).toMatchObject({
      width: "device-width",
      initialScale: 1,
    });
  });
});

describe("the root layout's data-theme", () => {
  afterEach(() => {
    state.theme = undefined;
  });

  const html = async () =>
    renderToStaticMarkup(
      await RootLayout({ children: createElement("p", null, "Page body") }),
    );

  it("sets no attribute for system, no cookie or a bad cookie", async () => {
    for (const value of [undefined, "system", "purple", "DARK", ""]) {
      state.theme = value;
      expect(await html(), String(value)).not.toContain("data-theme");
    }
  });

  it.each(["light", "dark"])(
    "puts data-theme=%s on <html>, so the first byte is already themed",
    async (theme) => {
      state.theme = theme;
      expect(await html()).toMatch(
        new RegExp(`^<html[^>]*data-theme="${theme}"`),
      );
    },
  );

  it("sends no script for it", async () => {
    state.theme = "dark";
    expect(await html()).not.toContain("<script");
  });

  it("passes the theme and the exact page to the account menu", async () => {
    state.theme = "dark";
    const page = await html();
    expect(page).toMatch(/<form[^>]*action="\/theme"/);
    expect(page).toMatch(/<button[^>]*aria-pressed="true"[^>]*>Dark</);
  });
});

describe("the root layout's header and height", () => {
  afterEach(() => vi.unstubAllEnvs());

  const render = async () =>
    renderToStaticMarkup(
      await RootLayout({ children: createElement("p", null, "Page body") }),
    );

  it("renders the header on every page, signed out too, with the page after it", async () => {
    const html = await render();
    expect(html).toContain("<header");
    expect(html.indexOf("<header")).toBeLessThan(html.indexOf("<main"));
  });

  it("puts the demo banner before the header", async () => {
    vi.stubEnv("DEMO_MODE", "on");
    const html = await render();
    expect(html.indexOf("Demo data")).toBeLessThan(html.indexOf("<header"));
  });

  // Header + main fill exactly one screen: the body is the column, main grows.
  it("makes the body a full-height column and main the part that grows", async () => {
    const html = await render();
    expect(html).toMatch(/<body[^>]*class="[^"]*min-h-dvh[^"]*flex-col/);
    expect(html).toMatch(/<main[^>]*class="[^"]*flex-1/);
    expect(html).not.toMatch(/<main[^>]*min-h-dvh/);
  });
});
