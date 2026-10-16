import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TidyError } from "@/lib/tidyhq/errors";
import { MockTidyClient } from "@/lib/tidyhq/mock/MockTidyClient";
import { createSeed } from "@/lib/tidyhq/mock/seed";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getTidyClient: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tidyhq", () => ({
  getTidyClient: mocks.getTidyClient,
  getTidyMode: () => "mock",
}));
// Like Next's: redirect() never returns, it throws.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));

import { requireAdmin } from "./requireAdmin";

const NOW = new Date("2026-10-12T18:00:00Z");

function signedInAs(contactId: string, client = seededClient()) {
  mocks.getSession.mockResolvedValue({ contactId });
  mocks.getTidyClient.mockReturnValue(client);
  return client;
}

function seededClient() {
  return new MockTidyClient(createSeed(NOW), () => NOW);
}

describe("requireAdmin", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    mocks.getSession.mockReset();
    mocks.getTidyClient.mockReset();
  });

  it("returns the admin, and only ever an admin", async () => {
    signedInAs("c_casey");
    expect(await requireAdmin("/admin")).toEqual({
      contactId: "c_casey",
      name: "Casey Moreno",
    });
  });

  it("sends a signed-out visitor to sign in and back", async () => {
    mocks.getSession.mockResolvedValue(null);
    mocks.getTidyClient.mockReturnValue(seededClient());
    await expect(requireAdmin("/admin")).rejects.toThrow(
      "NEXT_REDIRECT /auth/signin?returnTo=%2Fadmin",
    );
  });

  describe("stops a non-admin itself, whatever the caller does with the result", () => {
    it("redirects a member who isn't in the group", async () => {
      signedInAs("c_dante");
      // A caller that forgets to check anything still never gets past this.
      let ran = false;
      await expect(
        (async () => {
          await requireAdmin("/admin");
          ran = true;
        })(),
      ).rejects.toThrow("NEXT_REDIRECT /admin/denied?reason=not_admin");
      expect(ran).toBe(false);
    });

    it("redirects as unavailable when the group can't be read", async () => {
      const client = signedInAs("c_casey");
      client.listGroupContacts = async () => {
        throw new TidyError(503, "TidyHQ unavailable");
      };
      await expect(requireAdmin("/admin")).rejects.toThrow(
        "NEXT_REDIRECT /admin/denied?reason=unavailable",
      );
    });

    it("redirects as unavailable when ADMIN_GROUP_ID is malformed", async () => {
      signedInAs("c_casey");
      vi.stubEnv("ADMIN_GROUP_ID", "12/34");
      await expect(requireAdmin("/admin")).rejects.toThrow(
        "NEXT_REDIRECT /admin/denied?reason=unavailable",
      );
    });
  });

  it("sends a session whose contact TidyHQ no longer has to sign in, like /me", async () => {
    signedInAs("c_gone");
    await expect(requireAdmin("/admin")).rejects.toThrow(
      "NEXT_REDIRECT /auth/signin?returnTo=%2Fadmin",
    );
  });

  it("reads the group and the contact together, not one after the other", async () => {
    const client = signedInAs("c_casey");
    const order: string[] = [];
    let release!: () => void;
    const group = client.listGroupContacts.bind(client);
    client.listGroupContacts = async (id) => {
      order.push("group started");
      await new Promise<void>((resolve) => (release = resolve));
      order.push("group done");
      return group(id);
    };
    const contact = client.getContact.bind(client);
    client.getContact = async (id) => {
      order.push("contact started");
      return contact(id);
    };
    const pending = requireAdmin("/admin");
    await vi.waitFor(() => expect(order).toContain("contact started"));
    expect(order).toEqual(["group started", "contact started"]);
    release();
    await pending;
  });

  it("doesn't fail the admin if the contact read fails for another reason", async () => {
    const client = signedInAs("c_casey");
    client.getContact = async () => {
      throw new TidyError(503, "TidyHQ unavailable");
    };
    expect(await requireAdmin("/admin")).toEqual({
      contactId: "c_casey",
      name: "Casey Moreno",
    });
  });
});
