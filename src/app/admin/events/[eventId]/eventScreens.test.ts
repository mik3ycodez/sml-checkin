import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Attendee } from "@/lib/admin/attendees";
import type { AdminEventPage } from "@/lib/admin/eventPage";
import {
  AdminEventScreen,
  AdminEventUnavailable,
  UnknownAdminEvent,
} from "./eventScreens";

function text(element: Parameters<typeof renderToStaticMarkup>[0]) {
  return renderToStaticMarkup(element)
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const URL = "https://checkin.example.org/checkin/ev_one";
const SVG = '<svg viewBox="0 0 29 29" data-test="qr"></svg>';

const EVENT: AdminEventPage = {
  id: "ev_one",
  name: "Social Night",
  location: "The Eagle",
  startAt: "2026-10-17T02:00:00Z", // 7:00 PM Seattle, Friday the 16th
  endAt: "2026-10-17T05:00:00Z",
  archived: false,
  groupId: "grp_one",
  window: {
    opensAt: new Date("2026-10-17T01:30:00Z"), // 6:30 PM
    closesAt: new Date("2026-10-17T04:00:00Z"), // 9:00 PM
    source: "event",
  },
  windowWarning: null,
  checkin: "not_yet",
  qr: { kind: "qr", path: "/checkin/ev_one" },
};

const CODE = { svg: SVG, url: URL };

const NOBODY: Attendee[] = [];

const render = (
  event: AdminEventPage,
  qr: { svg: string; url: string } | null = CODE,
  extra: {
    /** null: the event has no attendance group. */
    attendees?: Attendee[] | "unavailable" | null;
    refreshSeconds?: number | null;
  } = {},
) =>
  createElement(AdminEventScreen, {
    name: "Casey",
    event,
    qr,
    attendees: extra.attendees === undefined ? NOBODY : extra.attendees,
    refreshSeconds: extra.refreshSeconds ?? null,
  });

describe("AdminEventScreen", () => {
  it("shows the event, its time in Seattle time, and where", () => {
    const shown = text(render(EVENT));
    expect(shown).toContain("Social Night");
    expect(shown).toContain("Friday, October 16 at 7:00 PM");
    expect(shown).toContain("The Eagle");
  });

  it("shows the check-in window", () => {
    const shown = text(render(EVENT));
    expect(shown).toContain("Friday, October 16 at 6:30 PM");
    expect(shown).toContain("Friday, October 16 at 9:00 PM");
    expect(shown).not.toContain("start and end");
  });

  it("says when the window is the event's own start and end", () => {
    const shown = text(
      render({ ...EVENT, window: { ...EVENT.window, source: "fallback" } }),
    );
    expect(shown).toContain("the event's start and end");
  });

  it("says nothing about being open when members can't check in", () => {
    for (const reason of ["archived", "no_group", "never_opens"] as const) {
      const shown = text(
        render(
          { ...EVENT, checkin: "unavailable", qr: { kind: "none", reason } },
          null,
        ),
      );
      expect(shown, reason).not.toMatch(/Check-in (is|isn't) (open|closed)/);
      expect(shown, reason).not.toContain("Opens ");
    }
  });

  it.each([
    ["not_yet", "Check-in isn't open yet"],
    ["open", "Check-in is open"],
    ["closed", "Check-in is closed"],
  ] as const)("says whether check-in is open (%s)", (checkin, words) => {
    expect(text(render({ ...EVENT, checkin }))).toContain(words);
  });

  it("shows the check-in URL as text and the QR code inline, labelled", () => {
    const html = renderToStaticMarkup(render(EVENT));
    expect(text(render(EVENT))).toContain(URL);
    expect(html).toContain('data-test="qr"');
    expect(html).toContain('role="img"');
    expect(html).toMatch(/aria-label="[^"]*Social Night/);
  });

  it("prints cleanly: dark-mode colors can't reach the QR, and the chrome is hidden", () => {
    const html = renderToStaticMarkup(render(EVENT));
    // A white panel behind the code, in any theme, so the quiet zone stays light.
    expect(html).toMatch(/class="[^"]*bg-white/);
    // Controls (back link, sign-out) don't print.
    expect(html).toContain("print:hidden");
  });

  it("links back to the event list", () => {
    expect(renderToStaticMarkup(render(EVENT))).toContain('href="/admin"');
  });

  it("offers a way to sign out and returns to this event's page", () => {
    const html = renderToStaticMarkup(render(EVENT));
    expect(html).toContain("Signed in as Casey");
    expect(html).toContain('value="/admin/events/ev_one"');
  });

  it("calls an unnamed event untitled, and omits a missing location", () => {
    const shown = text(render({ ...EVENT, name: null, location: null }));
    expect(shown).toContain("Untitled event");
    expect(shown).not.toContain("The Eagle");
  });

  describe("the attendee list", () => {
    const THREE: Attendee[] = [
      { id: "c_1", name: "Ana Lopez" },
      { id: "c_2", name: "Ben Ito" },
      { id: "c_3", name: "Cy Young" },
    ];

    it("shows the count and the names in the order given", () => {
      const shown = text(render(EVENT, CODE, { attendees: THREE }));
      expect(shown).toContain("Checked in (3)");
      expect(shown.indexOf("Ana Lopez")).toBeGreaterThan(-1);
      expect(shown.indexOf("Ana Lopez")).toBeLessThan(shown.indexOf("Ben Ito"));
      expect(shown.indexOf("Ben Ito")).toBeLessThan(shown.indexOf("Cy Young"));
    });

    it("lists the names as a list, one item each", () => {
      const html = renderToStaticMarkup(
        render(EVENT, CODE, { attendees: THREE }),
      );
      expect(html.match(/<li[ >]/g)).toHaveLength(3);
    });

    it("says nobody has checked in yet, with a count of 0", () => {
      const shown = text(render(EVENT));
      expect(shown).toContain("Checked in (0)");
      expect(shown).toContain("Nobody has checked in yet");
    });

    it("puts the QR code before the list", () => {
      const html = renderToStaticMarkup(
        render(EVENT, CODE, { attendees: THREE }),
      );
      expect(html.indexOf('data-test="qr"')).toBeLessThan(
        html.indexOf("Ana Lopez"),
      );
    });

    it("escapes a name, so it can't add markup", () => {
      const html = renderToStaticMarkup(
        render(EVENT, CODE, {
          attendees: [{ id: "c_x", name: "<script>alert(1)</script>" }],
        }),
      );
      expect(html).not.toContain("<script>");
    });

    it("says the list couldn't load, in plain words, and keeps the QR code", () => {
      const html = renderToStaticMarkup(
        render(EVENT, CODE, { attendees: "unavailable" }),
      );
      const shown = text(render(EVENT, CODE, { attendees: "unavailable" }));
      expect(shown).toContain("couldn't load the list of who's checked in");
      expect(shown).toContain("try again");
      expect(shown).not.toContain("Checked in (");
      expect(html).toContain('data-test="qr"');
      expect(shown).toContain(URL);
      // Still a page with the event on it, and a role the admin can notice.
      expect(shown).toContain("Social Night");
      expect(html).toContain('role="status"');
    });

    it("has no list for an event with no attendance group", () => {
      const shown = text(render(EVENT, null, { attendees: null }));
      expect(shown).not.toContain("Checked in (");
      expect(shown).not.toContain("couldn't load");
    });
  });

  describe("the refresh", () => {
    it("asks the browser to reload every 30 seconds, with no JavaScript", () => {
      const html = renderToStaticMarkup(
        render(EVENT, CODE, { refreshSeconds: 30 }),
      );
      expect(html).toMatch(/<meta[^>]*http-equiv="refresh"[^>]*content="30"/);
      expect(html).not.toContain("<script");
    });

    it("tells the admin the list updates itself", () => {
      expect(text(render(EVENT, CODE, { refreshSeconds: 30 }))).toContain(
        "Updates every 30 seconds",
      );
    });

    it("adds no refresh, and no promise of one, when there isn't one", () => {
      const html = renderToStaticMarkup(render(EVENT));
      expect(html).not.toContain("http-equiv");
      expect(text(render(EVENT))).not.toContain("Updates every");
    });

    it("still refreshes when the list couldn't load, so it can recover", () => {
      const html = renderToStaticMarkup(
        render(EVENT, CODE, {
          attendees: "unavailable",
          refreshSeconds: 30,
        }),
      );
      expect(html).toContain('http-equiv="refresh"');
    });
  });

  describe("when TidyHQ can't be read for the event itself", () => {
    const unavailable = () =>
      createElement(AdminEventUnavailable, {
        name: "Casey",
        eventId: "ev_one",
      });

    it("says it's temporarily unavailable and retrying, in plain words", () => {
      const shown = text(unavailable());
      expect(shown).toContain("temporarily unavailable");
      expect(shown).toContain("retry");
      expect(shown).not.toContain("Something went wrong");
    });

    it("reloads itself every 30 seconds, with no JavaScript", () => {
      const html = renderToStaticMarkup(unavailable());
      expect(html).toMatch(/<meta[^>]*http-equiv="refresh"[^>]*content="30"/);
      expect(html).not.toContain("<script");
    });

    it("links back to the events and offers sign-out", () => {
      const html = renderToStaticMarkup(unavailable());
      expect(html).toContain('href="/admin"');
      expect(html).toContain("Signed in as Casey");
      expect(html).toContain('value="/admin/events/ev_one"');
    });

    it("shows no event details, QR code, or attendee names", () => {
      const shown = text(unavailable());
      expect(shown).not.toContain("Checked in (");
      expect(renderToStaticMarkup(unavailable())).not.toContain("<svg");
    });
  });

  describe("without a QR code", () => {
    it.each([
      ["archived", "archived in tidyhq"],
      ["no_group", "no attendance group"],
      ["never_opens", "can't open"],
    ] as const)("explains %s instead", (reason, words) => {
      const event: AdminEventPage = {
        ...EVENT,
        archived: reason === "archived",
        checkin: "unavailable",
        qr: { kind: "none", reason },
      };
      const html = renderToStaticMarkup(render(event, null));
      expect(text(render(event, null)).toLowerCase()).toContain(words);
      expect(html).not.toContain("<svg");
      expect(html).not.toContain("/checkin/");
      expect(html).not.toContain('role="img"');
    });
  });

  describe("window warnings", () => {
    const warned = (
      windowWarning: AdminEventPage["windowWarning"],
      over: Partial<AdminEventPage> = {},
    ) =>
      text(
        render({
          ...EVENT,
          window: { ...EVENT.window, source: "fallback" },
          windowWarning,
          ...over,
        }),
      );

    it.each([
      ["half_filled", "only one"],
      ["unparseable", "can't be read"],
      ["backwards", "closes before it opens"],
    ] as const)(
      "names the %s problem and says what check-in uses",
      (w, words) => {
        const shown = warned(w);
        expect(shown).toContain("Check the check-in window in TidyHQ");
        expect(shown).toContain(words);
        expect(shown).toContain("start and end");
      },
    );

    it("shows no warning when the window is fine", () => {
      expect(warned(null)).not.toContain("Check the check-in window");
    });

    it.each(["archived", "no_group", "never_opens"] as const)(
      "doesn't claim check-in is using the event's times when members can't check in at all (%s)",
      (reason) => {
        const shown = warned("backwards", {
          checkin: "unavailable",
          // The window may even have usable times: it's still not in use.
          qr: { kind: "none", reason },
        });
        expect(shown).toContain("Check the check-in window in TidyHQ");
        expect(shown).not.toContain("is using the event's start and end");
        expect(shown).toContain("ignored");
      },
    );

    it("says check-in is using the event's times when it really is, even if the window has closed", () => {
      expect(warned("backwards", { checkin: "closed" })).toContain(
        "Check-in is using the event's start and end instead.",
      );
    });
  });
});

describe("UnknownAdminEvent", () => {
  it("says the event wasn't found and links back to the list", () => {
    const html = renderToStaticMarkup(
      createElement(UnknownAdminEvent, { name: "Casey" }),
    );
    expect(text(createElement(UnknownAdminEvent, { name: "Casey" }))).toContain(
      "We couldn't find that event",
    );
    expect(html).toContain('href="/admin"');
  });
});

describe("AdminEventScreen staff check-in link", () => {
  it("links to the event's staff check-in page, hidden when printing", () => {
    const html = renderToStaticMarkup(render(EVENT));
    expect(html).toMatch(
      /<a[^>]*href="\/admin\/events\/ev_one\/checkin"[^>]*print:hidden[^>]*>Staff check-in<\/a>/,
    );
  });

  it("isn't offered when members can't check in at all", () => {
    const html = renderToStaticMarkup(
      render({ ...EVENT, checkin: "unavailable" }),
    );
    expect(html).not.toContain('/checkin"');
    expect(html).not.toContain("Staff check-in");
  });
});
