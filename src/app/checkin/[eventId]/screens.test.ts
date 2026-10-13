import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SignedInAs } from "./screens";

describe("SignedInAs", () => {
  const html = renderToStaticMarkup(
    createElement(SignedInAs, { name: "Dante Ruiz", eventId: "ev_tonight" }),
  );

  it("names the member", () => {
    expect(html).toContain("Dante Ruiz");
  });

  it("signs out with a plain form post that returns to the check-in page", () => {
    expect(html).toMatch(/<form[^>]*action="\/auth\/signout"[^>]*>/);
    expect(html).toMatch(/<form[^>]*method="post"/);
    expect(html).toContain('name="returnTo" value="/checkin/ev_tonight"');
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Sign out<\/button>/);
  });
});
