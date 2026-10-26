import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DEMO_PATH } from "@/lib/demoMode";
import { DemoBanner } from "./DemoBanner";

// Server-rendered markup: no script is needed for it to show, so it also
// shows with JavaScript off. The e2e suite checks it in a browser. The layout
// renders the banner only in demo mode, so its link does too.
describe("DemoBanner", () => {
  const html = renderToStaticMarkup(createElement(DemoBanner));

  it("says Demo data, in plain markup", () => {
    expect(html).toContain("Demo data");
    expect(html).not.toContain("<script");
  });

  it("links to the demo walkthrough", () => {
    expect(html).toMatch(
      new RegExp(`<a[^>]*href="${DEMO_PATH}"[^>]*>Demo walkthrough</a>`),
    );
  });
});
