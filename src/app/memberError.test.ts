import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MemberError } from "./memberError";

describe("MemberError", () => {
  const html = renderToStaticMarkup(
    createElement(MemberError, null, "We couldn't reach TidyHQ just now."),
  );

  it("says something went wrong, with the page's own explanation", () => {
    expect(html).toContain("Something went wrong");
    expect(html).toContain("We couldn&#x27;t reach TidyHQ just now.");
  });

  it("offers a plain-link retry that works without JavaScript", () => {
    expect(html).toMatch(/<a[^>]*href=""[^>]*>Try again<\/a>/);
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onClick");
  });
});
