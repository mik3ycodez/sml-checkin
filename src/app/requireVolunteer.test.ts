import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TidyError } from "@/lib/tidyhq/errors";
import { MockTidyClient } from "@/lib/tidyhq/mock/MockTidyClient";
import { createSeed, MOCK_HELPER_GROUP_ID } from "@/lib/tidyhq/mock/seed";

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

import { requireVolunteer } from "./requireVolunteer";

const NOW = new Date("2026-10-12T18:00:00Z");

function seededClient() {
  return new MockTidyClient(createSeed(NOW), () => NOW);
}

function signedInAs(contactId: string, client = seededClient()) {
  mocks.getSession.mockResolvedValue({ contactId });
  mocks.getTidyClient.mockReturnValue(client);
  return client;
}

describe("requireVolunteer", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    mocks.getSession.mockReset();
    mocks.getTidyClient.mockReset();
  });

  it("returns a volunteer, with their role", async () => {
    signedInAs("c_pat");
    expect(await requireVolunteer("/checkin/ev_tonight")).toEqual({
      contactId: "c_pat",
      name: "Pat Rivera",
      role: "volunteer",
    });
  });

  it("returns an admin who isn't a volunteer, with the admin role", async () => {
    signedInAs("c_casey");
    expect(await requireVolunteer("/checkin/ev_tonight")).toEqual({
      contactId: "c_casey",
      name: "Casey Moreno",
      role: "admin",
    });
  });

  it("sends a signed-out visitor to sign in and back", async () => {
    mocks.getSession.mockResolvedValue(null);
    mocks.getTidyClient.mockReturnValue(seededClient());
    await expect(requireVolunteer("/checkin/ev_tonight")).rejects.toThrow(
      "NEXT_REDIRECT /auth/signin?returnTo=%2Fcheckin%2Fev_tonight",
    );
  });

  it("sends a session whose contact TidyHQ no longer has to sign in", async () => {
    signedInAs("c_gone");
    await expect(requireVolunteer("/checkin/ev_tonight")).rejects.toThrow(
      "NEXT_REDIRECT /auth/signin?returnTo=%2Fcheckin%2Fev_tonight",
    );
  });

  describe("stops a non-volunteer itself, whatever the caller does with the result", () => {
    it("redirects a member in neither group; the code after it never runs", async () => {
      signedInAs("c_dante");
      let ran = false;
      // A caller that ignores the return value (and any role) still can't
      // get past the guard.
      await expect(
        (async () => {
          await requireVolunteer("/checkin/ev_tonight");
          ran = true;
        })(),
      ).rejects.toThrow("NEXT_REDIRECT /admin/denied?reason=not_admin");
      expect(ran).toBe(false);
    });

    it("never resolves for a non-volunteer, however many times it's called", async () => {
      signedInAs("c_dante");
      const results = await Promise.allSettled([
        requireVolunteer("/a"),
        requireVolunteer("/b"),
        requireVolunteer("/c"),
      ]);
      expect(results.map((r) => r.status)).toEqual([
        "rejected",
        "rejected",
        "rejected",
      ]);
    });

    it("redirects as unavailable when the volunteers group can't be read", async () => {
      const client = signedInAs("c_pat");
      const read = client.listGroupContacts.bind(client);
      client.listGroupContacts = async (id) => {
        if (id === MOCK_HELPER_GROUP_ID)
          throw new TidyError(503, "TidyHQ unavailable");
        return read(id);
      };
      await expect(requireVolunteer("/checkin/ev_tonight")).rejects.toThrow(
        "NEXT_REDIRECT /admin/denied?reason=unavailable",
      );
    });

    it("redirects as unavailable when HELPER_GROUP_ID is malformed", async () => {
      signedInAs("c_pat");
      vi.stubEnv("HELPER_GROUP_ID", "12/34");
      await expect(requireVolunteer("/checkin/ev_tonight")).rejects.toThrow(
        "NEXT_REDIRECT /admin/denied?reason=unavailable",
      );
    });
  });

  it("re-checks TidyHQ on every call: a removed volunteer is refused next time", async () => {
    const client = signedInAs("c_pat");
    await expect(requireVolunteer("/x")).resolves.toMatchObject({
      role: "volunteer",
    });
    const read = client.listGroupContacts.bind(client);
    client.listGroupContacts = async (id) =>
      (await read(id)).filter((c) => c.id !== "c_pat");
    await expect(requireVolunteer("/x")).rejects.toThrow(
      "NEXT_REDIRECT /admin/denied?reason=not_admin",
    );
  });

  it("reads the groups on every call, not once", async () => {
    const client = signedInAs("c_pat");
    const read = vi.spyOn(client, "listGroupContacts");
    await requireVolunteer("/x");
    await requireVolunteer("/x");
    expect(read).toHaveBeenCalledTimes(4);
  });
});
