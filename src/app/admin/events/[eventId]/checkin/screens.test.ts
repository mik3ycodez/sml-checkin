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

  it("offers Stop volunteering to admins too", () => {
    const admin = html(
      createElement(StaffSearchScreen, {
        ...frame,
        staff: { name: "Casey Moreno", role: "admin" },
        query: "",
        search: { status: "none" },
      }),
    );
    expect(admin).toContain("Stop volunteering");
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
  const out = html(
    createElement(VolunteerModeEnded, { eventId: "ev_tonight" }),
  );

  it("says volunteer mode has ended, with a link back to check-in", () => {
    expect(out).toContain("Volunteer mode has ended");
    expect(out).toMatch(/<a[^>]*href="\/checkin\/ev_tonight"/);
  });
});
