import { afterEach, describe, expect, it, vi } from "vitest";
import { MockTidyClient } from "@/lib/tidyhq/mock/MockTidyClient";
import { createSeed } from "@/lib/tidyhq/mock/seed";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getTidyClient: vi.fn(),
}));
vi.mock("../../requireAdmin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/tidyhq", () => ({ getTidyClient: mocks.getTidyClient }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "localhost:3100" }),
}));

import AdminEventRoute from "./page";

const params = (eventId: string) =>
  ({ params: Promise.resolve({ eventId }) }) as Parameters<
    typeof AdminEventRoute
  >[0];

afterEach(() => {
  vi.unstubAllEnvs();
  mocks.requireAdmin.mockReset();
  mocks.getTidyClient.mockReset();
});

describe("the admin event page", () => {
  it("calls requireAdmin first, with this page as the place to return to, and reads nothing for a non-admin", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT /denied"));
    await expect(AdminEventRoute(params("ev a/b"))).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(mocks.requireAdmin).toHaveBeenCalledWith("/admin/events/ev%20a%2Fb");
    expect(mocks.getTidyClient).not.toHaveBeenCalled();
  });

  it("builds the QR link from APP_ORIGIN", async () => {
    vi.stubEnv("APP_ORIGIN", "https://checkin.example.org");
    mocks.requireAdmin.mockResolvedValue({
      contactId: "c_casey",
      name: "Casey",
    });
    mocks.getTidyClient.mockReturnValue(
      new MockTidyClient(createSeed(new Date())),
    );
    const { renderToStaticMarkup } = await import("react-dom/server");
    const html = renderToStaticMarkup(
      await AdminEventRoute(params("ev_tonight")),
    );
    expect(html).toContain("https://checkin.example.org/checkin/ev_tonight");
    expect(html).toContain("<svg");
  });

  it("says so for an event TidyHQ doesn't have", async () => {
    mocks.requireAdmin.mockResolvedValue({
      contactId: "c_casey",
      name: "Casey",
    });
    mocks.getTidyClient.mockReturnValue(
      new MockTidyClient(createSeed(new Date())),
    );
    const { renderToStaticMarkup } = await import("react-dom/server");
    const html = renderToStaticMarkup(await AdminEventRoute(params("ev_nope")));
    expect(html).toContain("We couldn&#x27;t find that event");
  });
});
