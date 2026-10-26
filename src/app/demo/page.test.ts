import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import DemoPage from "./page";
import { SCENARIOS, targetPath } from "./scenarios";

describe("/demo", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is not found unless DEMO_MODE=on", () => {
    vi.stubEnv("DEMO_MODE", "");
    expect(() => DemoPage()).toThrow("NEXT_NOT_FOUND");
    vi.stubEnv("DEMO_MODE", "off");
    expect(() => DemoPage()).toThrow("NEXT_NOT_FOUND");
  });

  describe("in demo mode", () => {
    const html = () => {
      vi.stubEnv("DEMO_MODE", "on");
      return renderToStaticMarkup(DemoPage());
    };

    it("lists every scenario, numbered, with its title", () => {
      const page = html();
      for (const scenario of SCENARIOS) {
        expect(page).toContain(`id="scenario-${scenario.number}"`);
        expect(page).toContain(scenario.title.replaceAll("&", "&amp;"));
      }
    });

    it("gives each part a sign-out form that returns to its start page", () => {
      const page = html();
      for (const scenario of SCENARIOS) {
        for (const part of scenario.parts) {
          const path = targetPath(part.target);
          expect(page).toContain(`value="${path}"`);
          expect(page).toContain(`Start as ${part.memberName}`);
        }
      }
      expect(page.match(/action="\/auth\/signout"/g)).toHaveLength(
        SCENARIOS.flatMap((s) => s.parts).length,
      );
      expect(page.match(/method="post"/g)).toHaveLength(
        SCENARIOS.flatMap((s) => s.parts).length,
      );
    });

    it("puts the second-browser tip before the first scenario", () => {
      const page = html();
      const tip = page.indexOf("private window");
      expect(tip).toBeGreaterThan(-1);
      expect(tip).toBeLessThan(page.indexOf('id="scenario-1"'));
    });

    it("explains the shared demo and that a Restart resets it", () => {
      const page = html();
      expect(page).toContain("Restart");
      expect(page).toContain("24 hours");
      expect(page).not.toMatch(/E2E|mock-tidyhq\/reset/);
    });

    it("needs no script", () => {
      expect(html()).not.toContain("<script");
    });
  });
});
