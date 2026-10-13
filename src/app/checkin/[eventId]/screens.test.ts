import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CheckinProblem, SignedInAs, StatusScreen, type ShownStatus } from "./screens";

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

/** Visible text, with tags dropped and React's text separators collapsed. */
function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function render(status: ShownStatus, awarded: number | null = null) {
  const html = renderToStaticMarkup(
    createElement(StatusScreen, { status, eventId: "ev_tonight", awarded }),
  );
  return { html, text: text(html) };
}

const DANTE = { name: "Dante Ruiz", eventName: "Social Night" };

describe("StatusScreen", () => {
  describe("checked in by this tap", () => {
    const { text } = render({ status: "checked_in", ...DANTE, total: 5 }, 1);

    it("confirms with the points just awarded and the new total", () => {
      expect(text).toContain("You're checked in, Dante Ruiz!");
      expect(text).toContain("+1 point");
      expect(text).toContain("Your total: 5");
    });

    it("pluralizes larger awards", () => {
      expect(render({ status: "checked_in", ...DANTE, total: 6 }, 2).text).toContain(
        "+2 points",
      );
    });
  });

  describe("already checked in", () => {
    const { text } = render({ status: "checked_in", ...DANTE, total: 5 });

    it("says so, with no extra point, and shows the total", () => {
      expect(text).toContain("You're already checked in");
      expect(text).toContain("no extra point");
      expect(text).toContain("Your total: 5");
      expect(text).not.toContain("+1");
    });

    it("shows the check-in without a total when the total is unreadable", () => {
      const shown = render({ status: "checked_in", ...DANTE, total: null }).text;
      expect(shown).toContain("You're already checked in");
      expect(shown).not.toContain("Your total");
    });

    it("lets a shared phone switch members", () => {
      expect(text).toContain("Signed in as Dante Ruiz");
    });
  });

  describe("membership expired", () => {
    const { html, text } = render({ status: "membership_inactive", ...DANTE });

    it("explains, and links to renew on SML's TidyHQ site", () => {
      expect(text).toContain("Your membership isn't active");
      expect(html).toMatch(/<a[^>]*href="https:\/\/sml\.tidyhq\.com"[^>]*>Renew/);
    });

    it("lets the member try again after renewing", () => {
      expect(html).toContain('href="/checkin/ev_tonight"');
    });

    it("lets a shared phone switch members", () => {
      expect(text).toContain("Signed in as Dante Ruiz");
    });
  });

  it("shows when check-in opens, in Seattle time", () => {
    const { text } = render({
      status: "not_open",
      ...DANTE,
      opensAt: new Date("2026-10-18T02:00:00Z"),
    });
    expect(text).toContain("Check-in hasn't opened yet");
    expect(text).toContain("Saturday, October 17 at 7:00 PM (Seattle time)");
    expect(text).toContain("Social Night");
  });

  it("says when check-in has closed", () => {
    const { text } = render({ status: "closed", ...DANTE });
    expect(text).toContain("Check-in for Social Night has closed");
  });

  it("names a stand-in when the event has no name", () => {
    const { text } = render({ status: "closed", name: "Dante Ruiz", eventName: null });
    expect(text).toContain("Check-in for SML event has closed");
  });

  it("asks the member to see a volunteer when their total is unreadable", () => {
    const { text } = render({ status: "points_unreadable", ...DANTE });
    expect(text).toContain("Please see a volunteer");
    expect(text).toContain("You're not checked in yet");
  });

  it("explains an unknown event", () => {
    const { text } = render({ status: "unknown_event" });
    expect(text).toContain("We couldn't find that event");
    expect(text).not.toContain("Signed in as");
  });
});

describe("CheckinProblem", () => {
  const html = renderToStaticMarkup(
    createElement(CheckinProblem, { eventId: "ev_tonight" }),
  );

  it("apologizes and offers to try again from the check-in page", () => {
    expect(text(html)).toContain("Something went wrong");
    expect(html).toMatch(/<a[^>]*href="\/checkin\/ev_tonight"[^>]*>Try again/);
  });

  it("says a volunteer can help", () => {
    expect(text(html)).toContain("volunteer");
  });
});
