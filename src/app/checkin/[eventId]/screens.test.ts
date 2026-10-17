import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MembershipNotice } from "@/lib/membership";
import type { TapOutcome } from "@/lib/checkin/tapNotice";
import { SignedInAs } from "../../memberUi";
import { CheckinProblem, StatusScreen, type ShownStatus } from "./screens";

describe("SignedInAs", () => {
  const html = renderToStaticMarkup(
    createElement(SignedInAs, {
      name: "Dante Ruiz",
      returnTo: "/checkin/ev_tonight",
    }),
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

describe("SignedInAs without a name", () => {
  const html = renderToStaticMarkup(
    createElement(SignedInAs, { name: null, returnTo: "/admin" }),
  );

  it("doesn't claim who's signed in, but still signs out", () => {
    expect(html).not.toContain("Signed in as");
    expect(html).toMatch(/<form[^>]*action="\/auth\/signout"[^>]*>/);
    expect(html).toContain('name="returnTo" value="/admin"');
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

function render(
  status: ShownStatus,
  notice: TapOutcome | null = null,
  now?: Date,
) {
  const html = renderToStaticMarkup(
    createElement(StatusScreen, { status, eventId: "ev_tonight", notice, now }),
  );
  return { html, text: text(html) };
}

const DANTE = { name: "Dante Ruiz", eventName: "Social Night", total: 0 };

describe("StatusScreen", () => {
  const CHECKED_IN = {
    status: "already_checked_in",
    ...DANTE,
    total: 5,
  } as const;

  describe("checked in by this tap", () => {
    const { text } = render(CHECKED_IN, { kind: "awarded", points: 1 });

    it("confirms with the points just awarded and the new total", () => {
      expect(text).toContain("You're checked in, Dante Ruiz!");
      expect(text).toContain("+1 point");
      expect(text).toContain("Total: 5");
    });

    it("pluralizes larger awards", () => {
      expect(render(CHECKED_IN, { kind: "awarded", points: 2 }).text).toContain(
        "+2 points",
      );
    });
  });

  describe("checked in with a membership notice", () => {
    const awarded = (membershipNotice: MembershipNotice) =>
      render(CHECKED_IN, { kind: "awarded", points: 1, membershipNotice });

    it("tells a member with a balance due to pay in TidyHQ, with a link", () => {
      const { html, text } = awarded({ kind: "balance_due" });
      expect(text).toContain("You're checked in, Dante Ruiz!");
      expect(text).toContain("+1 point");
      expect(text).toContain(
        "You have a balance due. Complete payment in TidyHQ.",
      );
      expect(html).toMatch(
        /<a[^>]*href="https:\/\/sml\.tidyhq\.com"[^>]*>[^<]*TidyHQ/,
      );
    });

    it("tells a member in the grace period when it expired and when to renew by", () => {
      const { html, text } = awarded({
        kind: "grace",
        expiredOn: "2026-09-22",
        renewBy: "2026-11-21",
      });
      expect(text).toContain("+1 point");
      expect(text).toContain(
        "Your membership expired on September 22, 2026. Renew by November 21, 2026 to keep earning points.",
      );
      expect(html).toMatch(
        /<a[^>]*href="https:\/\/sml\.tidyhq\.com"[^>]*>Renew/,
      );
    });

    it("says the membership ends today when it ends today", () => {
      const { text } = render(
        CHECKED_IN,
        {
          kind: "awarded",
          points: 1,
          membershipNotice: {
            kind: "grace",
            expiredOn: "2026-10-12",
            renewBy: "2026-12-11",
          },
        },
        new Date("2026-10-12T18:00:00Z"),
      );
      expect(text).toContain(
        "Your membership ends today. Renew by December 11, 2026 to keep earning points.",
      );
      expect(text).not.toContain("expired on");
    });

    it("still shows the notice when the point didn't save", () => {
      const { text } = render(CHECKED_IN, {
        kind: "point_not_saved",
        membershipNotice: { kind: "balance_due" },
      });
      expect(text).toContain(
        "You're checked in, but we couldn't confirm your point",
      );
      expect(text).toContain("You have a balance due.");
    });

    it("shows no notice for a paid-up member", () => {
      const { text } = render(CHECKED_IN, { kind: "awarded", points: 1 });
      expect(text).not.toContain("balance due");
      expect(text).not.toContain("Renew");
    });

    it("shows no notice on a plain page load", () => {
      expect(render(CHECKED_IN).text).not.toContain("balance due");
    });
  });

  describe("club colors", () => {
    const at18 = { ...CHECKED_IN, total: 18 };
    const qualifiedAs = (
      standing: "current" | "balance_due" | "grace" | "lapsed",
    ): TapOutcome => ({
      kind: "awarded",
      points: 1,
      qualified: [{ rewardId: "club_colors", standing }],
    });

    it("tells a current member this point qualified them", () => {
      const { text } = render(at18, qualifiedAs("current"));
      expect(text).toContain("+1 point");
      expect(text).toContain(
        "You qualify for club colors! A Board member will connect with you to distribute your club colors.",
      );
    });

    it("asks a member with a balance due to complete payment first", () => {
      expect(render(at18, qualifiedAs("balance_due")).text).toContain(
        "You qualify for club colors. You will need to complete payment before receiving club colors.",
      );
    });

    it("asks a member in the grace period to renew first", () => {
      expect(render(at18, qualifiedAs("grace")).text).toContain(
        "You qualify for club colors. You will need to renew before receiving club colors.",
      );
    });

    it("says nothing when this point didn't qualify them", () => {
      const { text } = render(at18, { kind: "awarded", points: 1 });
      expect(text).not.toContain("club colors");
    });

    it("says nothing on a repeat tap or a plain reload", () => {
      expect(render(at18, { kind: "repeat" }).text).not.toContain(
        "club colors",
      );
      expect(render(at18, null).text).not.toContain("club colors");
    });
  });

  describe("link to the status page", () => {
    it.each([
      ["a fresh check-in", { kind: "awarded", points: 1 } as const],
      ["a repeat tap", { kind: "repeat" } as const],
      ["a plain reload", null],
    ])("is offered after %s", (_name, notice) => {
      const { html, text } = render(CHECKED_IN, notice);
      expect(html).toMatch(/<a[^>]*href="\/me"[^>]*>See your points<\/a>/);
      expect(text).toContain("See your points");
    });

    it("is offered when the point didn't save, too", () => {
      expect(render(CHECKED_IN, { kind: "point_not_saved" }).html).toContain(
        'href="/me"',
      );
    });

    it("isn't offered when the member isn't checked in", () => {
      // They get the quiet "My points and status" link instead (see below).
      expect(render({ status: "closed", ...DANTE }).text).not.toContain(
        "See your points",
      );
    });
  });

  describe("tapped again after checking in", () => {
    const { text } = render(CHECKED_IN, { kind: "repeat" });

    it("says there's no extra point, and shows the total", () => {
      expect(text).toContain("You're already checked in");
      expect(text).toContain("no extra point this time");
      expect(text).toContain("Total: 5");
      expect(text).not.toContain("+1");
    });
  });

  describe("checked in, but the point couldn't be confirmed", () => {
    const { html, text } = render(CHECKED_IN, { kind: "point_not_saved" });

    it("says the check-in is saved, and sends a Board member to check the total before adding anything", () => {
      expect(text).toContain(
        "You're checked in, but we couldn't confirm your point",
      );
      expect(text).toContain("Please tell a Board member.");
      expect(text).toContain(
        "They should check your total in TidyHQ before adding anything",
      );
      expect(text).not.toContain("didn't save");
    });

    it("doesn't offer to try again, or show a total that's missing the point", () => {
      expect(text).not.toContain("Try again");
      expect(text).not.toContain("Total");
      expect(html).not.toContain('href="/checkin/ev_tonight"');
    });

    it("lets a shared phone switch members", () => {
      expect(text).toContain("Signed in as Dante Ruiz");
    });
  });

  describe("already checked in, on a fresh page load", () => {
    const { text } = render(CHECKED_IN);

    it("just shows the check-in and the total", () => {
      expect(text).toContain("You're already checked in");
      expect(text).toContain("Total: 5");
      expect(text).not.toContain("no extra point");
      expect(text).not.toContain("+1");
    });

    it("shows the check-in without a total when the total is unreadable", () => {
      const shown = render({ ...CHECKED_IN, total: null }).text;
      expect(shown).toContain("You're already checked in");
      expect(shown).not.toContain("Total");
    });

    it("lets a shared phone switch members", () => {
      expect(text).toContain("Signed in as Dante Ruiz");
    });
  });

  describe("event not open for check-in", () => {
    const { text, html } = render({ status: "event_unavailable", ...DANTE });

    it("says the event isn't open for check-in, with no check-in button or renew link", () => {
      expect(text).toContain("This event isn't open for check-in");
      expect(html).not.toContain("tidyhq.com");
      expect(text).not.toMatch(/Check me in|Check in\b/);
      expect(text).not.toContain("Renew");
    });

    it("lets a shared phone switch members", () => {
      expect(text).toContain("Signed in as Dante Ruiz");
    });
  });

  describe("membership expired", () => {
    const { html, text } = render({ status: "membership_inactive", ...DANTE });

    it("explains, and links to renew on SML's TidyHQ site", () => {
      expect(text).toContain("Your membership isn't active");
      expect(html).toMatch(
        /<a[^>]*href="https:\/\/sml\.tidyhq\.com"[^>]*>Renew/,
      );
    });

    it("lets the member try again after renewing", () => {
      expect(html).toContain('href="/checkin/ev_tonight"');
    });

    it("warns that a renewal can take a minute to show up", () => {
      expect(text).toContain(
        "Just renewed? It can take a minute to update. Try again shortly.",
      );
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

  it("says when check-in has closed, naming the event once", () => {
    const { text } = render({ status: "closed", ...DANTE });
    expect(text).toContain("Social Night Check-in has closed");
    expect(text.match(/Social Night/g)).toHaveLength(1);
  });

  it("names a stand-in when the event has no name", () => {
    const { text } = render({
      status: "closed",
      name: "Dante Ruiz",
      eventName: null,
      total: 0,
    });
    expect(text).toContain("SML event Check-in has closed");
  });

  it("asks the member to see a Board member when their total is unreadable", () => {
    const { text } = render({ status: "points_unreadable", ...DANTE });
    expect(text).toContain("Please see a Board member");
    expect(text).toContain("You're not checked in yet");
  });

  it("explains an unknown event", () => {
    const { text } = render({ status: "unknown_event" });
    expect(text).toContain("We couldn't find that event");
    expect(text).toContain("Please tell a Board member.");
    expect(text).not.toContain("check you in");
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

describe("the volunteer link", () => {
  const STAFF = 'href="/admin/events/ev_tonight/checkin"';
  const screens: [string, ShownStatus][] = [
    ["checked in", { status: "already_checked_in", ...DANTE, total: 5 }],
    ["membership inactive", { status: "membership_inactive", ...DANTE }],
    ["not open", { status: "not_open", ...DANTE, opensAt: new Date() }],
    ["points unreadable", { status: "points_unreadable", ...DANTE }],
  ];

  // Not on "closed" or "unavailable": volunteer mode has ended there.
  it.each(screens)("is on the %s screen", (_, status) => {
    const { html, text } = render(status);
    expect(html).toContain(STAFF);
    expect(text).toContain("Are you a volunteer?");
  });

  it("is on the check-in result screens", () => {
    const { html } = render(
      { status: "already_checked_in", ...DANTE, total: 5 },
      { kind: "awarded", points: 1 },
    );
    expect(html).toContain(STAFF);
  });

  it("is not on an unknown event, where nobody is identified", () => {
    const { html } = render({ status: "unknown_event" });
    expect(html).not.toContain("/admin/");
  });
});

describe("the My points and status link", () => {
  const ME = /<a[^>]*href="\/me"[^>]*>My points and status<\/a>/;
  const count = (html: string) => (html.match(/href="\/me"/g) ?? []).length;
  const without: [string, ShownStatus][] = [
    ["membership inactive", { status: "membership_inactive", ...DANTE }],
    ["not open", { status: "not_open", ...DANTE, opensAt: new Date() }],
    ["closed", { status: "closed", ...DANTE }],
    ["event unavailable", { status: "event_unavailable", ...DANTE }],
    ["points unreadable", { status: "points_unreadable", ...DANTE }],
  ];

  it.each(without)("is on the %s screen, once", (_, status) => {
    const { html } = render(status);
    expect(html).toMatch(ME);
    expect(count(html)).toBe(1);
  });

  it("sits next to the volunteer link", () => {
    const { text } = render({ status: "points_unreadable", ...DANTE });
    expect(text).toContain("My points and status");
    expect(text.indexOf("My points and status")).toBeLessThan(
      text.indexOf("Are you a volunteer?"),
    );
  });

  it("isn't added to checked-in screens, which already link to /me", () => {
    const checkedIn = {
      status: "already_checked_in",
      ...DANTE,
      total: 5,
    } as const;
    for (const notice of [
      null,
      { kind: "awarded", points: 1 },
      { kind: "repeat" },
      { kind: "point_not_saved" },
    ] as const) {
      const { html } = render(checkedIn, notice);
      expect(html).not.toContain("My points and status");
      expect(count(html)).toBe(1);
    }
  });
});

describe("no member screen sends someone to a volunteer for what a volunteer can't do", () => {
  const all: [string, ShownStatus, TapOutcome | null][] = [
    ["inactive", { status: "membership_inactive", ...DANTE }, null],
    ["not open", { status: "not_open", ...DANTE, opensAt: new Date() }, null],
    ["closed", { status: "closed", ...DANTE }, null],
    ["unavailable", { status: "event_unavailable", ...DANTE }, null],
    ["points unreadable", { status: "points_unreadable", ...DANTE }, null],
    [
      "point not saved",
      { status: "already_checked_in", ...DANTE, total: 5 },
      { kind: "point_not_saved" },
    ],
    ["unknown event", { status: "unknown_event" }, null],
  ];

  it.each(all)("%s", (_, status, notice) => {
    // The "Are you a volunteer?" link is the only mention allowed.
    const { text } = render(status, notice);
    expect(text.replace("Are you a volunteer?", "")).not.toMatch(/volunteer/i);
  });

  it("sends closed and unavailable members to a Board member", () => {
    for (const status of ["closed", "event_unavailable"] as const) {
      expect(render({ status, ...DANTE }).text).toContain(
        "If you were there, tell a Board member.",
      );
    }
  });

  it("says what to do about unreadable points", () => {
    expect(render({ status: "points_unreadable", ...DANTE }).text).toContain(
      "A Board member needs to fix your points in TidyHQ before you can check in.",
    );
  });

  it("hides the volunteer link where volunteer mode has already ended", () => {
    for (const status of ["closed", "event_unavailable"] as const) {
      expect(render({ status, ...DANTE }).text).not.toContain(
        "Are you a volunteer?",
      );
    }
    expect(
      render({ status: "not_open", ...DANTE, opensAt: new Date() }).text,
    ).toContain("Are you a volunteer?");
  });
});
