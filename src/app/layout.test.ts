import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("./globals.css", () => ({}));

import RootLayout from "./layout";

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
