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

  it("says it's temporarily unavailable, and keeps refreshing, when TidyHQ fails the event read", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = new MockTidyClient(createSeed(new Date()));
    client.getEvent = async () => {
      throw new TidyError(503, "TidyHQ is down");
    };
    const html = await renderFor(client, "ev_tonight");
    expect(html).toContain("temporarily unavailable");
    expect(html).toMatch(/http-equiv="refresh"[^>]*content="30"/);
    expect(html).not.toContain("Checked in (");
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("event"),
      "TidyError 503: TidyHQ is down",
    );
    error.mockRestore();
  });

  it("lets a bug while reading the event reach the error page", async () => {
    const client = new MockTidyClient(createSeed(new Date()));
    client.getEvent = async () => {
      throw new TypeError("bug");
    };
    await expect(renderFor(client, "ev_tonight")).rejects.toThrow("bug");
  });

  it("reads the attendee list only after the event, whose group it needs", async () => {
    const client = new MockTidyClient(createSeed(new Date()));
    const log: string[] = [];
    const getEvent = client.getEvent.bind(client);
    client.getEvent = async (id) => {
      log.push("event start");
      await new Promise((resolve) => setTimeout(resolve, 20));
      log.push("event end");
      return getEvent(id);
    };
    const list = client.listGroupContacts.bind(client);
    client.listGroupContacts = async (id) => {
      log.push("attendees start");
      return list(id);
    };
    await renderFor(client, "ev_tonight");
    // The attendance group is part of the event (see eventGroups.ts), so the
    // two reads can't overlap any more.
    expect(log.indexOf("attendees start")).toBeGreaterThan(
      log.indexOf("event end"),
    );
  });

  it("reads no attendee list for an event with no attendance group", async () => {
    const client = new MockTidyClient(createSeed(new Date()));
    const read = vi.spyOn(client, "listGroupContacts");
    await renderFor(client, "ev_nope");
    expect(read).not.toHaveBeenCalled();
  });
});
