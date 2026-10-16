import { describe, expect, it } from "vitest";
import { staffNoteText } from "./staffNote";

const staff = {
  contactId: "c_pat",
  name: "Pat Rivera",
  role: "volunteer",
} as const;

describe("staffNoteText", () => {
  it("names the event, the role and person, and the Seattle time", () => {
    expect(
      staffNoteText({
        eventId: "ev_tonight",
        eventName: "Social Night",
        staff,
        now: new Date("2026-10-15T02:32:00Z"),
      }),
    ).toBe(
      "Checked in to Social Night (ev_tonight) by volunteer: Pat Rivera (c_pat), 2026-10-14 7:32 PM",
    );
  });

  it("says admin for an admin", () => {
    expect(
      staffNoteText({
        eventId: "ev_tonight",
        eventName: "Social Night",
        staff: { ...staff, role: "admin" },
        now: new Date("2026-10-15T02:32:00Z"),
      }),
    ).toContain("by admin: Pat Rivera (c_pat)");
  });

  it("uses Seattle time on both sides of the daylight saving change", () => {
    const at = (iso: string) =>
      staffNoteText({
        eventId: "e",
        eventName: "E",
        staff,
        now: new Date(iso),
      });
    expect(at("2026-11-02T03:05:00Z")).toContain("2026-11-01 7:05 PM"); // PST
    expect(at("2026-03-01T20:00:00Z")).toContain("2026-03-01 12:00 PM"); // PST
    expect(at("2026-03-09T20:00:00Z")).toContain("2026-03-09 1:00 PM"); // PDT
  });

  it("falls back for an untitled event", () => {
    expect(
      staffNoteText({
        eventId: "ev_x",
        eventName: null,
        staff,
        now: new Date("2026-10-15T02:32:00Z"),
      }),
    ).toContain("Checked in to an untitled event (ev_x) by");
  });
});
