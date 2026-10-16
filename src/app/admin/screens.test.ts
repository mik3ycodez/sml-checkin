import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminDeniedScreen, AdminHomeScreen } from "./screens";

function text(element: Parameters<typeof renderToStaticMarkup>[0]) {
  return renderToStaticMarkup(element)
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

describe("AdminDeniedScreen", () => {
  it("tells a member who isn't an admin that this page is for the Board", () => {
    const shown = text(
      createElement(AdminDeniedScreen, { reason: "not_admin", name: "Dante" }),
    );
    expect(shown).toContain("You don't have access to the admin pages");
    expect(shown).toContain("Signed in as Dante");
    expect(shown).not.toContain("couldn't check");
  });

  it("says admin access couldn't be checked, not that they aren't an admin", () => {
    const shown = text(
      createElement(AdminDeniedScreen, {
        reason: "unavailable",
        name: "Casey",
      }),
    );
    expect(shown).toContain("We couldn't check admin access");
    expect(shown).not.toContain("don't have access");
  });
});

describe("AdminDeniedScreen without a name", () => {
  it("still offers a way to sign out", () => {
    const html = renderToStaticMarkup(
      createElement(AdminDeniedScreen, { reason: "unavailable", name: null }),
    );
    expect(html).toContain('action="/auth/signout"');
    expect(html).not.toContain("Signed in as");
  });
});

describe("AdminHomeScreen", () => {
  it("shows who's signed in", () => {
    const shown = text(
      createElement(AdminHomeScreen, { name: "Casey Moreno" }),
    );
    expect(shown).toContain("Admin");
    expect(shown).toContain("Signed in as Casey Moreno");
  });
});
