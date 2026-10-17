import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DemoBanner } from "./DemoBanner";

// Server-rendered markup: no script is needed for it to show, so it also
// shows with JavaScript off. The e2e suite checks it in a browser.
describe("DemoBanner", () => {
  it("says Demo data, in plain markup", () => {
    const html = renderToStaticMarkup(createElement(DemoBanner));
    expect(html).toContain("Demo data");
    expect(html).not.toContain("<script");
  });
});
