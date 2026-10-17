import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const leftDuringRender: Array<number | null> = [];
vi.mock("./memberStatus", () => ({
  memberStatus: async () => {
    leftDuringRender.push(remainingMs());
    return {
      contactId: "c_dante",
      status: {
        status: "ready",
        name: "Dante Ruiz",
        eventName: "Social Night",
      },
    };
  },
}));
vi.mock("./actions", () => ({ checkInAction: async () => {} }));

import { CHECKIN_BUDGET_MS, remainingMs } from "@/lib/tidyhq/budget";
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

  it("renders inside a time budget, so a slow TidyHQ ends in the app's own error screen, not the host's 504", async () => {
    leftDuringRender.length = 0;
    await CheckInPage({
      params: Promise.resolve({ eventId: "ev_tonight" }),
    } as never);
    expect(leftDuringRender).toHaveLength(1);
    expect(leftDuringRender[0]).not.toBeNull();
    expect(leftDuringRender[0]).toBeLessThanOrEqual(CHECKIN_BUDGET_MS);
  });
});
