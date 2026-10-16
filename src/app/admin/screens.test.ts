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

const EVENT = {
  id: "ev_one",
  name: "Social Night",
  startAt: "2026-10-17T02:00:00Z", // 7:00 PM Seattle, Friday the 16th
  location: "The Eagle",
  hasGroup: true,
};

describe("AdminHomeScreen", () => {
  it("shows who's signed in", () => {
    const shown = text(
      createElement(AdminHomeScreen, {
        name: "Casey Moreno",
        events: { upcoming: [], recent: [] },
      }),
    );
    expect(shown).toContain("Admin");
    expect(shown).toContain("Signed in as Casey Moreno");
  });

  it("links each event to its admin page, with time and place in Seattle time", () => {
    const html = renderToStaticMarkup(
      createElement(AdminHomeScreen, {
        name: "Casey",
        events: {
          upcoming: [EVENT],
          recent: [{ ...EVENT, id: "ev/two?x", name: "Pub Night" }],
        },
      }),
    );
    expect(html).toContain('href="/admin/events/ev_one"');
    // Ids are encoded into the path.
    expect(html).toContain('href="/admin/events/ev%2Ftwo%3Fx"');
    const shown = text(
      createElement(AdminHomeScreen, {
        name: "Casey",
        events: { upcoming: [EVENT], recent: [] },
      }),
    );
    expect(shown).toContain("Upcoming");
    expect(shown).toContain("Social Night");
    expect(shown).toContain("Friday, October 16 at 7:00 PM");
    expect(shown).toContain("The Eagle");
  });

  it("has a Recent section only when there are recent events", () => {
    const none = text(
      createElement(AdminHomeScreen, {
        name: "Casey",
        events: { upcoming: [EVENT], recent: [] },
      }),
    );
    expect(none).not.toContain("Recent");
    const some = text(
      createElement(AdminHomeScreen, {
        name: "Casey",
        events: { upcoming: [], recent: [EVENT] },
      }),
    );
    expect(some).toContain("Recent");
  });

  it("marks an event with no attendance group", () => {
    const shown = text(
      createElement(AdminHomeScreen, {
        name: "Casey",
        events: { upcoming: [{ ...EVENT, hasGroup: false }], recent: [] },
      }),
    );
    expect(shown).toContain("No attendance group");
    const fine = text(
      createElement(AdminHomeScreen, {
        name: "Casey",
        events: { upcoming: [EVENT], recent: [] },
      }),
    );
    expect(fine).not.toContain("No attendance group");
  });

  it("shows an unnamed event as untitled, and says when there are none", () => {
    const unnamed = text(
      createElement(AdminHomeScreen, {
        name: "Casey",
        events: { upcoming: [{ ...EVENT, name: null }], recent: [] },
      }),
    );
    expect(unnamed).toContain("Untitled event");
    const empty = text(
      createElement(AdminHomeScreen, {
        name: "Casey",
        events: { upcoming: [], recent: [] },
      }),
    );
    expect(empty).toContain("No upcoming events");
  });

  it("says the events couldn't be loaded, still showing who's signed in", () => {
    const shown = text(
      createElement(AdminHomeScreen, { name: "Casey", events: null }),
    );
    expect(shown).toContain("couldn't load the events");
    expect(shown).toContain("Signed in as Casey");
  });
});
