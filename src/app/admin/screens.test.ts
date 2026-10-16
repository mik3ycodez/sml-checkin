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

describe("AdminDeniedScreen retrying", () => {
  it("reloads the event page after 30 seconds when access couldn't be checked", () => {
    const html = renderToStaticMarkup(
      createElement(AdminDeniedScreen, {
        reason: "unavailable",
        name: "Casey",
        retryPath: "/admin/events/ev_one",
      }),
    );
    expect(html).toMatch(
      /<meta[^>]*http-equiv="refresh"[^>]*content="30;url=\/admin\/events\/ev_one"/,
    );
    expect(html).not.toContain("<script");
  });

  it("says it will try again by itself", () => {
    const shown = text(
      createElement(AdminDeniedScreen, {
        reason: "unavailable",
        name: "Casey",
        retryPath: "/admin/events/ev_one",
      }),
    );
    expect(shown).toContain("try again in 30 seconds");
  });

  it("never refreshes for not_admin, even if given a path", () => {
    const html = renderToStaticMarkup(
      createElement(AdminDeniedScreen, {
        reason: "not_admin",
        name: "Dante",
        retryPath: "/admin/events/ev_one",
      }),
    );
    expect(html).not.toContain("http-equiv");
  });

  it("has no refresh without a path", () => {
    expect(
      renderToStaticMarkup(
        createElement(AdminDeniedScreen, { reason: "unavailable", name: null }),
      ),
    ).not.toContain("http-equiv");
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
  archived: false,
  invalidTimes: false,
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

  it("labels an archived event and doesn't link to it", () => {
    const events = {
      upcoming: [{ ...EVENT, archived: true }],
      recent: [],
    };
    const html = renderToStaticMarkup(
      createElement(AdminHomeScreen, { name: "Casey", events }),
    );
    expect(html).not.toContain("/admin/events/");
    expect(
      text(createElement(AdminHomeScreen, { name: "Casey", events })),
    ).toContain("Archived");
    expect(html).toContain("Social Night");
  });

  it("warns about an event whose end isn't after its start", () => {
    const shown = text(
      createElement(AdminHomeScreen, {
        name: "Casey",
        events: {
          upcoming: [{ ...EVENT, invalidTimes: true }],
          recent: [],
        },
      }),
    );
    expect(shown).toContain("end time isn't after its start");
    const fine = text(
      createElement(AdminHomeScreen, {
        name: "Casey",
        events: { upcoming: [EVENT], recent: [] },
      }),
    );
    expect(fine).not.toContain("end time isn't after");
    expect(fine).not.toContain("Archived");
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

describe("AdminDeniedScreen on the staff check-in page", () => {
  it("tells a non-volunteer how to get access, and links back to check-in", () => {
    const html = renderToStaticMarkup(
      createElement(AdminDeniedScreen, {
        reason: "not_admin",
        name: "Dante",
        staffEventId: "ev_one",
      }),
    );
    const shown = text(
      createElement(AdminDeniedScreen, {
        reason: "not_admin",
        name: "Dante",
        staffEventId: "ev_one",
      }),
    );
    expect(shown).toContain("App Check-In Volunteers");
    expect(shown).not.toContain("admin pages");
    expect(html).toContain('href="/checkin/ev_one"');
    expect(html).toContain("Back to check-in");
    expect(html).not.toContain('href="/admin"');
  });

  it("says check-in access couldn't be checked, and retries by itself", () => {
    const element = createElement(AdminDeniedScreen, {
      reason: "unavailable",
      name: "Pat",
      staffEventId: "ev_one",
      retryPath: "/admin/events/ev_one/checkin",
    });
    expect(text(element)).toContain("couldn't check check-in access");
    expect(text(element)).toContain("try again in 30 seconds");
    expect(renderToStaticMarkup(element)).toContain(
      'content="30;url=/admin/events/ev_one/checkin"',
    );
  });

  it("keeps the admin wording elsewhere", () => {
    expect(
      text(
        createElement(AdminDeniedScreen, { reason: "not_admin", name: null }),
      ),
    ).toContain("You don't have access to the admin pages");
  });
});

describe("AdminHomeScreen reports", () => {
  it("links to the club colors owed report", () => {
    const html = renderToStaticMarkup(
      createElement(AdminHomeScreen, {
        name: "Casey",
        events: { upcoming: [], recent: [] },
      }),
    );
    expect(html).toMatch(
      /<a[^>]*href="\/admin\/reports\/colors"[^>]*>[^<]*[Cc]lub colors/,
    );
  });
});
