import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProfileMenu } from "./ProfileMenu";

const render = (
  props: Omit<Parameters<typeof ProfileMenu>[0], "theme" | "pagePath"> &
    Partial<Parameters<typeof ProfileMenu>[0]>,
) =>
  renderToStaticMarkup(
    createElement(ProfileMenu, {
      theme: "system",
      pagePath: props.returnTo,
      ...props,
    }),
  );

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

describe("ProfileMenu's theme row", () => {
  const dante = { name: "Dante Ruiz", initials: "DR" };
  const forms = (html: string) =>
    [...html.matchAll(/<form[^>]*action="\/theme"[^>]*>.*?<\/form>/g)].map(
      (m) => m[0],
    );

  it.each([
    ["signed in", dante],
    ["signed out", null],
  ])("is in the menu when %s", (_, profile) => {
    const html = render({ profile, returnTo: "/" });
    const [form, ...more] = forms(html);
    expect(more).toEqual([]);
    expect(form).toMatch(/method="post"/);
    expect(form).toContain("Theme");
    expect(html).not.toContain("<script");
  });

  it("has System, Light and Dark buttons posting to /theme", () => {
    const [form] = forms(render({ profile: dante, returnTo: "/" }));
    const buttons = [...form.matchAll(/<button([^>]*)>(.*?)<\/button>/g)];
    expect(buttons.map((b) => b[2].replace(/<[^>]+>/g, ""))).toEqual([
      "System",
      "Light",
      "Dark",
    ]);
    expect(buttons.map((b) => b[1].match(/value="(\w+)"/)?.[1])).toEqual([
      "system",
      "light",
      "dark",
    ]);
    for (const [, attrs] of buttons) {
      expect(attrs).toContain('name="theme"');
      expect(attrs).toContain('type="submit"');
    }
  });

  it.each(["system", "light", "dark"] as const)(
    "marks only %s as pressed",
    (theme) => {
      for (const profile of [dante, null]) {
        const [form] = forms(render({ profile, returnTo: "/", theme }));
        const pressed = [...form.matchAll(/<button([^>]*)>/g)].map(
          (b) => b[1].match(/aria-pressed="(\w+)"/)?.[1],
        );
        expect(pressed).toEqual(
          ["system", "light", "dark"].map((t) => String(t === theme)),
        );
      }
    },
  );

  // Sign out returns a check-in screen to its start; the theme switch must not.
  it("returns to the exact page, not Sign out's return page", () => {
    const html = render({
      profile: dante,
      returnTo: "/checkin/ev_tonight",
      pagePath: "/checkin/ev_tonight/problem?reason=x",
    });
    const [form] = forms(html);
    expect(form).toMatch(
      /<input[^>]*name="returnTo"[^>]*value="\/checkin\/ev_tonight\/problem\?reason=x"/,
    );
    expect(html).toMatch(
      /action="\/auth\/signout".*name="returnTo"[^>]*value="\/checkin\/ev_tonight"/,
    );
  });

  it("sits between My points and status and Sign out", () => {
    const html = render({ profile: dante, returnTo: "/" });
    expect(html.indexOf("My points and status")).toBeLessThan(
      html.indexOf('action="/theme"'),
    );
    expect(html.indexOf('action="/theme"')).toBeLessThan(
      html.indexOf('action="/auth/signout"'),
    );
  });

  it("is reachable signed out, next to Sign in", () => {
    const html = render({ profile: null, returnTo: "/", pagePath: "/" });
    expect(html.indexOf("Sign in")).toBeLessThan(
      html.indexOf('action="/theme"'),
    );
  });
});
