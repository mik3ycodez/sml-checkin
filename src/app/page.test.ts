import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEMO_PATH } from "@/lib/demoMode";
import Home from "./page";

describe("the home page", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("has one clear action: My points and status, linking to /me", () => {
    vi.stubEnv("DEMO_MODE", "");
    const html = renderToStaticMarkup(createElement(Home));
    expect(html).toMatch(/<a[^>]*href="\/me"[^>]*>My points and status<\/a>/);
    expect(html.match(/<a /g)).toHaveLength(1);
  });
});

describe("the home page's demo walkthrough link", () => {
  afterEach(() => vi.unstubAllEnvs());

  const render = () => renderToStaticMarkup(createElement(Home));

  it("appears in demo mode, beside My points and status", () => {
    vi.stubEnv("DEMO_MODE", "on");
    const html = render();
    expect(html).toMatch(
      new RegExp(`<a[^>]*href="${DEMO_PATH}"[^>]*>Demo walkthrough</a>`),
    );
    expect(html).toMatch(/<a[^>]*href="\/me"[^>]*>My points and status<\/a>/);
  });

  it("is absent outside demo mode", () => {
    vi.stubEnv("DEMO_MODE", "");
    expect(render()).not.toContain(DEMO_PATH);
    vi.stubEnv("DEMO_MODE", "off");
    expect(render()).not.toContain(DEMO_PATH);
  });
});
