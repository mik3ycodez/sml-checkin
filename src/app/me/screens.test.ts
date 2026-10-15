import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MemberSummary } from "@/lib/member/memberSummary";
import type { RecentEvent } from "@/lib/member/recentEvents";
import { MeScreen } from "./screens";

const NOW = new Date("2026-10-12T18:00:00Z");

type Shown = Exclude<MemberSummary, { status: "unknown_contact" }>;
type Ok = Extract<Shown, { status: "ok" }>;

const OK: Ok = {
  status: "ok",
  name: "Dante Ruiz",
  level: "Full Member",
  membershipEndsOn: "2027-03-27",
  membership: "active",
  notice: null,
  points: 5,
  rewards: [],
};

function render(summary: Shown, recentEvents: RecentEvent[] | null = []) {
  const html = renderToStaticMarkup(
    createElement(MeScreen, { summary, recentEvents, now: NOW }),
  );
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return { html, text };
}

const TIDYHQ_LINK = /<a[^>]*href="https:\/\/sml\.tidyhq\.com"[^>]*>/;

describe("MeScreen", () => {
  describe("a current member", () => {
    const { html, text } = render(OK);

    it("shows their name, level and points", () => {
      expect(text).toContain("Dante Ruiz");
      expect(text).toContain("Full Member");
      expect(text).toContain("Points: 5");
    });

    it("says when the membership runs to, with no renewal prompt", () => {
      expect(text).toContain("Active until March 27, 2027");
      expect(text).not.toContain("Renew");
      expect(html).not.toMatch(TIDYHQ_LINK);
    });

    it("is view only, apart from signing out and returning to /me", () => {
      expect(html.match(/<form/g)).toHaveLength(1);
      expect(html).toContain('action="/auth/signout"');
      expect(html).toContain('name="returnTo" value="/me"');
      expect(text).toContain("Signed in as Dante Ruiz");
    });

    it("has no script tags", () => {
      expect(html).not.toContain("<script");
    });
  });

  it("says the membership is open-ended when it has no end date", () => {
    const { text } = render({ ...OK, membershipEndsOn: null });
    expect(text).toContain("Active");
    expect(text).not.toContain("Active until");
  });

  describe("membership messages", () => {
    it("reminds a member near their end date, with a renew link", () => {
      const { html, text } = render({
        ...OK,
        membership: "renew_soon",
        membershipEndsOn: "2026-10-26",
      });
      expect(text).toContain("Your membership ends on October 26, 2026");
      expect(html).toMatch(
        /<a[^>]*href="https:\/\/sml\.tidyhq\.com"[^>]*>Renew/,
      );
    });

    it("asks a member with a balance due to pay in TidyHQ, not to renew", () => {
      const { html, text } = render({
        ...OK,
        membership: "balance_due",
        notice: { kind: "balance_due" },
      });
      expect(text).toContain(
        "You have a balance due. Complete payment in TidyHQ.",
      );
      expect(text).not.toContain("Your membership ends on");
      expect(html).toMatch(/<a[^>]*href="https:\/\/sml\.tidyhq\.com"[^>]*>Pay/);
    });

    it("tells a member in the grace period when it expired and when to renew by", () => {
      const { html, text } = render({
        ...OK,
        membership: "grace",
        membershipEndsOn: "2026-09-22",
        notice: {
          kind: "grace",
          expiredOn: "2026-09-22",
          renewBy: "2026-11-21",
        },
      });
      expect(text).toContain(
        "Your membership expired on September 22, 2026. Renew by November 21, 2026 to keep earning points.",
      );
      expect(html).toMatch(
        /<a[^>]*href="https:\/\/sml\.tidyhq\.com"[^>]*>Renew/,
      );
    });

    it("says a grace-period membership ends today when it does", () => {
      const { text } = render({
        ...OK,
        membership: "grace",
        membershipEndsOn: "2026-10-12",
        notice: {
          kind: "grace",
          expiredOn: "2026-10-12",
          renewBy: "2026-12-11",
        },
      });
      expect(text).toContain("Your membership ends today.");
      expect(text).not.toContain("expired on");
    });

    it("tells a lapsed member it expired, with a renew link", () => {
      const { html, text } = render({
        ...OK,
        membership: "expired",
        membershipEndsOn: "2026-07-14",
      });
      expect(text).toContain("Your membership expired on July 14, 2026");
      expect(html).toMatch(
        /<a[^>]*href="https:\/\/sml\.tidyhq\.com"[^>]*>Renew/,
      );
    });
  });

  describe("points", () => {
    it("explains an unreadable total instead of showing one", () => {
      const { text } = render({ ...OK, points: null });
      expect(text).toContain(
        "Your points total needs fixing. Please see a volunteer.",
      );
      expect(text).not.toContain("Points:");
    });

    it("shows zero points", () => {
      expect(render({ ...OK, points: 0 }).text).toContain("Points: 0");
    });
  });

  describe("club colors", () => {
    const reward = (message: string): Ok["rewards"] => [
      {
        reward: { id: "club_colors", name: "club colors", pointsRequired: 18 },
        status: { kind: "progress", remaining: 3 },
        message,
      },
    ];

    it("shows each reward's message as given", () => {
      const { text } = render({
        ...OK,
        rewards: reward("3 more points until you qualify for club colors."),
      });
      expect(text).toContain(
        "3 more points until you qualify for club colors.",
      );
    });

    it("shows nothing when no reward can be read", () => {
      expect(render(OK).text).not.toContain("club colors");
    });
  });

  describe("not a member", () => {
    const { html, text } = render({
      status: "not_member",
      name: "Pat Doe",
      points: 4,
      rewards: [],
    });

    it("invites them to become a member on TidyHQ", () => {
      expect(text).toContain("Pat Doe");
      expect(text).toContain("You're not a member yet");
      expect(html).toMatch(
        /<a[^>]*href="https:\/\/sml\.tidyhq\.com"[^>]*>Become/,
      );
    });

    it("still shows their points", () => {
      expect(text).toContain("Points: 4");
    });
  });

  describe("recent events", () => {
    it("lists them in the order given, with Seattle dates", () => {
      const { text } = render(OK, [
        { id: "a", name: "Social Night", startAt: "2026-10-12T17:00:00Z" },
        { id: "b", name: "Pub Night", startAt: "2026-09-12T02:00:00Z" },
      ]);
      expect(text).toContain("Recent events");
      expect(text.indexOf("Social Night")).toBeLessThan(
        text.indexOf("Pub Night"),
      );
      expect(text).toContain("October 12, 2026");
      // 02:00 UTC is still the 11th in Seattle.
      expect(text).toContain("September 11, 2026");
    });

    it("names a stand-in for an event with no name", () => {
      const { text } = render(OK, [
        { id: "a", name: null, startAt: "2026-10-12T17:00:00Z" },
      ]);
      expect(text).toContain("SML event");
    });

    it("says so when there are none", () => {
      expect(render(OK, []).text).toContain("No events in the last 90 days");
    });

    it("says it couldn't load them, for that section only", () => {
      const { text } = render(OK, null);
      expect(text).toContain("Couldn't load recent events");
      expect(text).not.toContain("No events in the last");
      // The rest of the page is unaffected.
      expect(text).toContain("Dante Ruiz");
      expect(text).toContain("Points: 5");
      expect(text).toContain("Active until March 27, 2027");
    });
  });
});
