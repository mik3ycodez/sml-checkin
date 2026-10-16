import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("the home page", () => {
  const html = renderToStaticMarkup(createElement(Home));

  it("has one clear action: My points and status, linking to /me", () => {
    expect(html).toMatch(/<a[^>]*href="\/me"[^>]*>My points and status<\/a>/);
    expect(html.match(/<a /g)).toHaveLength(1);
  });
});
