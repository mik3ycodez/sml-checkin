import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./memberStatus", () => ({
  memberStatus: async () => ({
    contactId: "c_dante",
    status: { status: "ready", name: "Dante Ruiz", eventName: "Social Night" },
  }),
}));
vi.mock("./actions", () => ({ checkInAction: async () => {} }));

import CheckInPage from "./page";

describe("the check-in page", () => {
  it("links to My points and status beside the volunteer link, once", async () => {
    const element = await CheckInPage({
      params: Promise.resolve({ eventId: "ev_tonight" }),
    } as never);
    const html = renderToStaticMarkup(element);
    expect(html).toMatch(/<a[^>]*href="\/me"[^>]*>My points and status<\/a>/);
    expect(html.match(/href="\/me"/g)).toHaveLength(1);
    expect(html.indexOf("My points and status")).toBeLessThan(
      html.indexOf("Are you a volunteer?"),
    );
  });
});
