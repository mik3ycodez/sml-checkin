import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TidyError } from "../tidyhq/errors";
import { MockTidyClient } from "../tidyhq/mock/MockTidyClient";
import { createSeed, MOCK_ADMIN_GROUP_ID } from "../tidyhq/mock/seed";
import { adminAccess, adminGroup } from "./admin";

const NOW = new Date("2026-10-12T18:00:00Z");

const GROUP = { id: MOCK_ADMIN_GROUP_ID };

function seededClient() {
  return new MockTidyClient(createSeed(NOW), () => NOW);
}

describe("adminGroup", () => {
  it("uses ADMIN_GROUP_ID, trimmed", () => {
    expect(adminGroup({ ADMIN_GROUP_ID: " 221914 " }, "live")).toEqual({
      id: "221914",
    });
    expect(adminGroup({ ADMIN_GROUP_ID: "221914" }, "mock")).toEqual({
      id: "221914",
    });
  });

  it("falls back to the seed's App Admin group in mock mode", () => {
    expect(adminGroup({}, "mock")).toEqual({ id: MOCK_ADMIN_GROUP_ID });
    expect(adminGroup({ ADMIN_GROUP_ID: "  " }, "mock")).toEqual({
      id: MOCK_ADMIN_GROUP_ID,
    });
  });

  it("has no default in live mode: unset or blank is not configured", () => {
    const notConfigured = { problem: "not_configured" };
    expect(adminGroup({}, "live")).toEqual(notConfigured);
    expect(adminGroup({ ADMIN_GROUP_ID: "" }, "live")).toEqual(notConfigured);
    expect(adminGroup({ ADMIN_GROUP_ID: "   " }, "live")).toEqual(
      notConfigured,
    );
  });

  it.each(["../groups", "12/34", "1 2", "12?x=1", "a;b"])(
    "treats %j as invalid, even in mock mode (it is set, just wrong)",
    (value) => {
      expect(adminGroup({ ADMIN_GROUP_ID: value }, "live")).toEqual({
        problem: "invalid",
      });
      expect(adminGroup({ ADMIN_GROUP_ID: value }, "mock")).toEqual({
        problem: "invalid",
      });
    },
  );
});

describe("adminAccess", () => {
  let error: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    error = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => error.mockRestore());

  it("turns away a deactivated contact still in the App Admin group", async () => {
    const seed = createSeed(NOW);
    seed.contacts.find((c) => c.id === "c_casey")!.status = "inactive";
    const client = new MockTidyClient(seed, () => NOW);
    expect(await adminAccess(client, "c_casey", GROUP)).toEqual({
      status: "not_admin",
    });
  });

  it("admits a contact in the App Admin group, with their name", async () => {
    expect(await adminAccess(seededClient(), "c_casey", GROUP)).toEqual({
      status: "admin",
      name: "Casey Moreno",
    });
    expect(error).not.toHaveBeenCalled();
  });

  it("refuses a member who isn't in the group", async () => {
    expect(await adminAccess(seededClient(), "c_dante", GROUP)).toEqual({
      status: "not_admin",
    });
    expect(error).not.toHaveBeenCalled();
  });

  it("refuses a contact TidyHQ doesn't know", async () => {
    expect(await adminAccess(seededClient(), "c_nobody", GROUP)).toEqual({
      status: "not_admin",
    });
  });

  it("reads the group every time, so a removal takes effect at once", async () => {
    const client = seededClient();
    const group = client.listGroupContacts.bind(client);
    const read = vi.fn(group);
    client.listGroupContacts = read;
    await adminAccess(client, "c_casey", GROUP);
    await adminAccess(client, "c_casey", GROUP);
    expect(read).toHaveBeenCalledTimes(2);
    expect(read).toHaveBeenCalledWith(MOCK_ADMIN_GROUP_ID);
  });

  describe("fails closed, and logs why", () => {
    it("when the group read fails", async () => {
      const client = seededClient();
      client.listGroupContacts = async () => {
        throw new TidyError(503, "TidyHQ unavailable");
      };
      expect(await adminAccess(client, "c_casey", GROUP)).toEqual({
        status: "unavailable",
      });
      expect(error).toHaveBeenCalledWith("admin access unavailable", {
        contactId: "c_casey",
        reason: "read_failed",
        tidyStatus: 503,
        message: "TidyHQ unavailable",
      });
    });

    it("when the group doesn't exist (a wrong id)", async () => {
      expect(
        await adminAccess(seededClient(), "c_casey", { id: "grp_nope" }),
      ).toEqual({
        status: "unavailable",
      });
      expect(error).toHaveBeenCalledWith(
        "admin access unavailable",
        expect.objectContaining({ reason: "read_failed", tidyStatus: 404 }),
      );
    });

    it.each(["not_configured", "invalid"] as const)(
      "when the group id is unusable (%s), logging which",
      async (problem) => {
        const client = seededClient();
        const read = vi.spyOn(client, "listGroupContacts");
        expect(await adminAccess(client, "c_casey", { problem })).toEqual({
          status: "unavailable",
        });
        expect(read).not.toHaveBeenCalled();
        expect(error).toHaveBeenCalledWith("admin access unavailable", {
          contactId: "c_casey",
          reason: problem,
        });
      },
    );

    it("on a failure that isn't a TidyHQ error, without logging its message", async () => {
      const client = seededClient();
      client.listGroupContacts = async () => {
        throw new TypeError("fetch failed: Bearer secret-token");
      };
      expect(await adminAccess(client, "c_casey", GROUP)).toEqual({
        status: "unavailable",
      });
      expect(error).toHaveBeenCalledWith("admin access unavailable", {
        contactId: "c_casey",
        reason: "read_failed",
        errorName: "TypeError",
      });
    });
  });
});
