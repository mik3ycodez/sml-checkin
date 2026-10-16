import { afterEach, describe, expect, it, vi } from "vitest";
import { TidyError } from "@/lib/tidyhq/errors";
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

  async function renderFor(
    client: MockTidyClient,
    eventId: string,
  ): Promise<string> {
    mocks.requireAdmin.mockResolvedValue({
      contactId: "c_casey",
      name: "Casey",
    });
    mocks.getTidyClient.mockReturnValue(client);
    const { renderToStaticMarkup } = await import("react-dom/server");
    return renderToStaticMarkup(await AdminEventRoute(params(eventId)));
  }

  it("lists who has checked in, from the event's group, and refreshes while check-in is open", async () => {
    const client = new MockTidyClient(createSeed(new Date()));
    await client.addContactToGroup("grp_social_night", "c_marcus");
    await client.addContactToGroup("grp_social_night", "c_dante");
    const html = await renderFor(client, "ev_tonight");
    expect(html).toContain("Checked in (2)");
    expect(html.indexOf("Dante Ruiz")).toBeLessThan(
      html.indexOf("Marcus Bell"),
    );
    expect(html).toMatch(/http-equiv="refresh"[^>]*content="30"/);
  });

  it("doesn't refresh an event whose check-in has closed, but still lists it", async () => {
    const html = await renderFor(
      new MockTidyClient(createSeed(new Date())),
      "ev_pub_night",
    );
    expect(html).toContain("Checked in (2)");
    expect(html).not.toContain("http-equiv");
  });

  it("doesn't refresh an event that is days away", async () => {
    const html = await renderFor(
      new MockTidyClient(createSeed(new Date())),
      "ev_bootblack_social",
    );
    expect(html).not.toContain("http-equiv");
  });

  it("says the list couldn't load, and still shows the QR code, when TidyHQ fails the read", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = new MockTidyClient(createSeed(new Date()));
    client.listGroupContacts = async () => {
      throw new TidyError(503, "TidyHQ is down");
    };
    const html = await renderFor(client, "ev_tonight");
    expect(html).toContain("load the list of who&#x27;s checked in");
    expect(html).toContain("<svg");
    expect(html).toContain("http://localhost:3100/checkin/ev_tonight");
    // Still refreshing, so it recovers by itself.
    expect(html).toContain('http-equiv="refresh"');
    // Logged with the status and message, nothing else.
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("attendees"),
      "TidyError 503: TidyHQ is down",
    );
    error.mockRestore();
  });

  it("lets a bug in our own code reach the error page, not blame TidyHQ", async () => {
    const client = new MockTidyClient(createSeed(new Date()));
    client.listGroupContacts = async () => {
      throw new TypeError("bug");
    };
    await expect(renderFor(client, "ev_tonight")).rejects.toThrow("bug");
  });

  it("reads no attendees for an event TidyHQ doesn't have", async () => {
    const client = new MockTidyClient(createSeed(new Date()));
    const read = vi.spyOn(client, "listGroupContacts");
    await renderFor(client, "ev_nope");
    expect(read).not.toHaveBeenCalled();
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
