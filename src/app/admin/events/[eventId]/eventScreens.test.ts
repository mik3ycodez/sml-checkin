import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AdminEventPage } from "@/lib/admin/eventPage";
import { AdminEventScreen, UnknownAdminEvent } from "./eventScreens";

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

const render = (
  event: AdminEventPage,
  qr: { svg: string; url: string } | null = CODE,
) => createElement(AdminEventScreen, { name: "Casey", event, qr });

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
