import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProfileMenu } from "./ProfileMenu";

const render = (props: Parameters<typeof ProfileMenu>[0]) =>
  renderToStaticMarkup(createElement(ProfileMenu, props));

const dante = { name: "Dante Ruiz", initials: "DR" };
const marcus = {
  name: "Marcus Bell",
  initials: "MB",
  photo: "https://img.example.org/marcus.jpg",
};

describe("ProfileMenu, signed in", () => {
  const html = render({ profile: dante, returnTo: "/me" });

  it("is a native disclosure, with no script", () => {
    expect(html).toMatch(/^<details/);
    expect(html).toContain("<summary");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onClick");
  });

  it("labels the chip with the name for screen readers", () => {
    expect(html).toMatch(
      /<summary[^>]*aria-label="Account menu, signed in as Dante Ruiz"/,
    );
  });

  it("shows initials when there is no photo", () => {
    expect(html).toContain(">DR<");
    expect(html).not.toContain("<img");
  });

  it("shows only the avatar and chevron on narrow phones, the name from 640px", () => {
    const summary = html.slice(
      html.indexOf("<summary"),
      html.indexOf("</summary>"),
    );
    expect(summary).toContain("<svg");
    expect(summary).toMatch(
      /<span[^>]*hidden[^>]*min-\[640px\]:[^>]*>Dante Ruiz</,
    );
  });

  it("puts the name at the top of the open menu", () => {
    const panel = html.slice(html.indexOf("</summary>"));
    expect(panel.indexOf("Dante Ruiz")).toBeGreaterThanOrEqual(0);
    expect(panel.indexOf("Dante Ruiz")).toBeLessThan(
      panel.indexOf("My points and status"),
    );
  });

  it("links to /me and signs out with a POST that returns to this page", () => {
    expect(html).toMatch(
      /<a[^>]*href="\/me"[^>]*>[^<]*(<[^>]+>)*[^<]*My points and status/,
    );
    expect(html).toMatch(
      /<form[^>]*action="\/auth\/signout"[^>]*method="post"/,
    );
    expect(html).toMatch(/<input[^>]*name="returnTo"[^>]*value="\/me"/);
    expect(html).toMatch(
      /<button[^>]*type="submit"[^>]*>(<[^>]+>)*[^<]*Sign out/,
    );
  });

  it("keeps the menu on screen on a phone", () => {
    expect(html).toMatch(/absolute[^"]*right-0/);
    expect(html).toMatch(/max-w-\[calc\(100vw-2rem\)\]/);
  });

  it("returns to the page the member was on", () => {
    const there = render({ profile: dante, returnTo: "/checkin/ev_tonight" });
    expect(there).toMatch(/name="returnTo"[^>]*value="\/checkin\/ev_tonight"/);
  });
});

describe("ProfileMenu with a photo", () => {
  const html = render({ profile: marcus, returnTo: "/" });

  it("draws the photo over the initials, with no referrer and empty alt", () => {
    expect(html).toMatch(
      /<img[^>]*src="https:\/\/img\.example\.org\/marcus\.jpg"/,
    );
    expect(html).toMatch(
      /<img[^>]*referrerPolicy="no-referrer"|<img[^>]*referrerpolicy="no-referrer"/,
    );
    expect(html).toMatch(/<img[^>]*alt=""/);
    expect(html).toContain(">MB<");
  });

  it("uses a plain img, not next/image", () => {
    expect(html).not.toContain("/_next/image");
  });
});

describe("ProfileMenu for an older session with no profile", () => {
  const html = render({ profile: {}, returnTo: "/me" });

  it("shows a generic person icon and 'Signed in'", () => {
    expect(html).toMatch(/aria-label="Account menu, signed in"/);
    expect(html).toContain("Signed in");
    expect(html).not.toContain("<img");
    expect(html).toContain("<svg");
  });

  it("still offers My points and Sign out", () => {
    expect(html).toContain("My points and status");
    expect(html).toContain('action="/auth/signout"');
  });
});

describe("ProfileMenu, signed out", () => {
  const html = render({ profile: null, returnTo: "/" });

  it("is a small Menu with a Sign in link to /me", () => {
    expect(html).toMatch(/^<details/);
    expect(html).toContain("Menu");
    expect(html).toMatch(/<a[^>]*href="\/me"[^>]*>(<[^>]+>)*Sign in/);
  });

  it("has no sign-out form", () => {
    expect(html).not.toContain("/auth/signout");
    expect(html).not.toContain("My points and status");
  });
});

it("escapes a name", () => {
  const html = render({
    profile: { name: '<script>alert("x")</script>', initials: "X" },
    returnTo: "/",
  });
  expect(html).not.toContain("<script>");
});
