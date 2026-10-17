import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  StaffSearchScreen,
  StaffVerdictScreen,
  VolunteerModeEnded,
} from "./screens";

const html = (element: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(element);

const frame = {
  eventId: "ev_tonight",
  eventName: "Social Night",
  staff: { name: "Pat Rivera", role: "volunteer" as const },
};

describe("staff check-in frame", () => {
  const out = html(
    createElement(StaffSearchScreen, {
      ...frame,
      query: "",
      search: { status: "none" },
    }),
  );

  it("has a Stop volunteering link back to the member check-in page", () => {
    expect(out).toMatch(
      /<a[^>]*href="\/checkin\/ev_tonight"[^>]*>Stop volunteering<\/a>/,
    );
  });

  it("signs out to the member check-in page, not back to the staff page", () => {
    expect(out).toContain('name="returnTo" value="/checkin/ev_tonight"');
  });

  // Admins aren't volunteering: they reached this page from the event page,
  // so they get a way back there instead of "Stop volunteering".
  it("gives admins a link back to the event page, not Stop volunteering", () => {
    const admin = html(
      createElement(StaffSearchScreen, {
        ...frame,
        staff: { name: "Casey Moreno", role: "admin" },
        query: "",
        search: { status: "none" },
      }),
    );
    expect(admin).not.toContain("Stop volunteering");
    expect(admin).toMatch(
      /<a[^>]*href="\/admin\/events\/ev_tonight"[^>]*>Back to event page<\/a>/,
    );
    expect(admin).not.toContain(">Event page<");
  });

  it("has it on the verdict screen as well", () => {
    const verdict = html(
      createElement(StaffVerdictScreen, {
        ...frame,
        verdict: { name: "Dante Ruiz", total: 1, canCheckIn: false, text: "x" },
        notice: null,
        warnings: [],
        nothingSaved: false,
        memberId: "c_dante",
        query: "",
      }),
    );
    expect(verdict).toContain("Stop volunteering");
    expect(verdict).toContain('name="returnTo" value="/checkin/ev_tonight"');
  });
});

describe("VolunteerModeEnded", () => {
  const render = (reason: "closed" | "archived" | "no_group" | "never_opens") =>
    html(createElement(VolunteerModeEnded, { eventId: "ev_tonight", reason }));

  it("says volunteer mode has ended, with a link back to check-in", () => {
    const out = render("closed");
    expect(out).toContain("Volunteer mode has ended");
    expect(out).toMatch(/<a[^>]*href="\/checkin\/ev_tonight"/);
  });

  it("says check-in is over only when it closed", () => {
    const out = render("closed");
    expect(out).toContain("Check-in for this event is over.");
    expect(out).toContain("Thank you");
  });

  it.each(["archived", "no_group", "never_opens"] as const)(
    "for %s says it isn't available and to tell a Board member, with no thanks",
    (reason) => {
      const out = render(reason);
      expect(out).toContain("Check-in isn&#x27;t available for this event.");
      expect(out).toContain("Please tell a Board member.");
      expect(out).not.toContain("is over");
      expect(out).not.toContain("Thank you");
    },
  );
});

describe("when the point couldn't be confirmed", () => {
  it("says the check-in is saved, and to check the total in TidyHQ before adding anything", () => {
    const out = html(
      createElement(StaffVerdictScreen, {
        ...frame,
        verdict: { name: "Dante Ruiz", total: 1, canCheckIn: false, text: "x" },
        notice: { kind: "point_not_saved" },
        warnings: [],
        nothingSaved: false,
        memberId: "c_dante",
        query: "",
      }),
    );
    expect(out).toContain(
      "Checked in, but the point couldn&#x27;t be confirmed.",
    );
    expect(out).toContain("check their total in TidyHQ before adding anything");
    expect(out).not.toContain("didn&#x27;t save");
  });
});
