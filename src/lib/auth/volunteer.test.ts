import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TidyError } from "../tidyhq/errors";
import { MockTidyClient } from "../tidyhq/mock/MockTidyClient";
import {
  createSeed,
  MOCK_ADMIN_GROUP_ID,
  MOCK_HELPER_GROUP_ID,
} from "../tidyhq/mock/seed";
import { helperGroup, volunteerAccess } from "./volunteer";

const NOW = new Date("2026-10-12T18:00:00Z");

const HELPERS = { id: MOCK_HELPER_GROUP_ID };
const ADMINS = { id: MOCK_ADMIN_GROUP_ID };

function seededClient() {
  return new MockTidyClient(createSeed(NOW), () => NOW);
}

describe("helperGroup", () => {
  it("uses HELPER_GROUP_ID, trimmed", () => {
    expect(helperGroup({ HELPER_GROUP_ID: " 99 " }, "live")).toEqual({
      id: "99",
    });
  });

  it("falls back to the seed's volunteers group in mock mode only", () => {
    expect(helperGroup({}, "mock")).toEqual(HELPERS);
    expect(helperGroup({ HELPER_GROUP_ID: " " }, "mock")).toEqual(HELPERS);
    expect(helperGroup({}, "live")).toEqual({ problem: "not_configured" });
    expect(helperGroup({ HELPER_GROUP_ID: "" }, "live")).toEqual({
      problem: "not_configured",
    });
  });

  it.each(["../groups", "12/34", "1 2", "a;b"])(
    "treats %j as invalid, even in mock mode",
    (value) => {
      for (const mode of ["live", "mock"] as const) {
        expect(helperGroup({ HELPER_GROUP_ID: value }, mode)).toEqual({
          problem: "invalid",
        });
      }
    },
  );
});

describe("volunteerAccess", () => {
  let error: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    error = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => error.mockRestore());

  const access = (client: MockTidyClient, contactId: string) =>
    volunteerAccess(client, contactId, HELPERS, ADMINS);

  it("admits a volunteer, as a volunteer", async () => {
    expect(await access(seededClient(), "c_pat")).toEqual({
      status: "volunteer",
      name: "Pat Rivera",
    });
    expect(error).not.toHaveBeenCalled();
  });

  it("admits an admin who isn't in the volunteers group, as an admin", async () => {
    expect(await access(seededClient(), "c_casey")).toEqual({
      status: "admin",
      name: "Casey Moreno",
    });
  });

  it("says admin for someone in both groups", async () => {
    const client = seededClient();
    client.listGroupContacts = async () =>
      [{ id: "c_both", display_name: "Both Roles" }] as never;
    expect(await access(client, "c_both")).toEqual({
      status: "admin",
      name: "Both Roles",
    });
  });

  it("refuses a member in neither group, without logging", async () => {
    expect(await access(seededClient(), "c_dante")).toEqual({
      status: "not_volunteer",
    });
    expect(await access(seededClient(), "c_nobody")).toEqual({
      status: "not_volunteer",
    });
    expect(error).not.toHaveBeenCalled();
  });

  it("reads both groups on every call, so a removal takes effect at once", async () => {
    const client = seededClient();
    const read = vi.spyOn(client, "listGroupContacts");
    await access(client, "c_pat");
    await access(client, "c_pat");
    expect(read).toHaveBeenCalledTimes(4);
    expect(read).toHaveBeenCalledWith(MOCK_HELPER_GROUP_ID);
    expect(read).toHaveBeenCalledWith(MOCK_ADMIN_GROUP_ID);
  });

  it("stops admitting a volunteer once they leave the group", async () => {
    const client = seededClient();
    expect((await access(client, "c_pat")).status).toBe("volunteer");
    const read = client.listGroupContacts.bind(client);
    client.listGroupContacts = async (id) =>
      (await read(id)).filter((c) => c.id !== "c_pat");
    expect((await access(client, "c_pat")).status).toBe("not_volunteer");
  });

  describe("fails closed, and logs why, apart from 'not a volunteer'", () => {
    it("when the volunteers group can't be read", async () => {
      const client = seededClient();
      const read = client.listGroupContacts.bind(client);
      client.listGroupContacts = async (id) => {
        if (id === MOCK_HELPER_GROUP_ID)
          throw new TidyError(503, "TidyHQ unavailable");
        return read(id);
      };
      expect(await access(client, "c_pat")).toEqual({ status: "unavailable" });
      expect(error).toHaveBeenCalledWith("volunteer access unavailable", {
        contactId: "c_pat",
        group: "helper",
        reason: "read_failed",
        tidyStatus: 503,
        message: "TidyHQ unavailable",
      });
    });

    it("when the volunteers group doesn't exist (a wrong id)", async () => {
      expect(
        await volunteerAccess(
          seededClient(),
          "c_pat",
          { id: "grp_nope" },
          ADMINS,
        ),
      ).toEqual({ status: "unavailable" });
      expect(error).toHaveBeenCalledWith(
        "volunteer access unavailable",
        expect.objectContaining({ group: "helper", tidyStatus: 404 }),
      );
    });

    it.each(["not_configured", "invalid"] as const)(
      "when HELPER_GROUP_ID is unusable (%s), without reading it",
      async (problem) => {
        const client = seededClient();
        const read = vi.spyOn(client, "listGroupContacts");
        expect(
          await volunteerAccess(client, "c_pat", { problem }, ADMINS),
        ).toEqual({ status: "unavailable" });
        expect(read).not.toHaveBeenCalledWith(MOCK_HELPER_GROUP_ID);
        expect(error).toHaveBeenCalledWith("volunteer access unavailable", {
          contactId: "c_pat",
          group: "helper",
          reason: problem,
        });
      },
    );

    it("still admits an admin when only the volunteers group is broken", async () => {
      expect(
        await volunteerAccess(
          seededClient(),
          "c_casey",
          { problem: "not_configured" },
          ADMINS,
        ),
      ).toEqual({ status: "admin", name: "Casey Moreno" });
    });

    it("still admits a volunteer when only the admin group is broken, without logging", async () => {
      const client = seededClient();
      const read = client.listGroupContacts.bind(client);
      client.listGroupContacts = async (id) => {
        if (id === MOCK_ADMIN_GROUP_ID) throw new TidyError(500, "boom");
        return read(id);
      };
      expect(await access(client, "c_pat")).toEqual({
        status: "volunteer",
        name: "Pat Rivera",
      });
      // They were let in, so the broken group changed nothing: not an error.
      expect(error).not.toHaveBeenCalled();
    });

    it("admits an admin without logging when HELPER_GROUP_ID isn't set yet (live go-live)", async () => {
      expect(
        await volunteerAccess(
          seededClient(),
          "c_casey",
          helperGroup({}, "live"),
          ADMINS,
        ),
      ).toEqual({ status: "admin", name: "Casey Moreno" });
      expect(error).not.toHaveBeenCalled();
    });

    it("answers volunteer, deliberately, for someone in both groups while the admin group is unreadable", async () => {
      // We can't see the admin group, so we can't confirm the higher role:
      // they get the lesser one until TidyHQ recovers. Fails closed, never up.
      const client = seededClient();
      const read = client.listGroupContacts.bind(client);
      client.listGroupContacts = async (id) => {
        if (id === MOCK_ADMIN_GROUP_ID) throw new TidyError(503, "down");
        return id === MOCK_HELPER_GROUP_ID
          ? [...(await read(id)), ...(await read(MOCK_ADMIN_GROUP_ID))]
          : read(id);
      };
      expect(await access(client, "c_casey")).toEqual({
        status: "volunteer",
        name: "Casey Moreno",
      });
    });

    it("logs each unreadable group once when it ends up denying", async () => {
      const client = seededClient();
      client.listGroupContacts = async () => {
        throw new TidyError(503, "down");
      };
      expect(await access(client, "c_dante")).toEqual({
        status: "unavailable",
      });
      expect(error).toHaveBeenCalledTimes(2);
      expect(error).toHaveBeenCalledWith(
        "volunteer access unavailable",
        expect.objectContaining({ group: "helper" }),
      );
      expect(error).toHaveBeenCalledWith(
        "volunteer access unavailable",
        expect.objectContaining({ group: "admin" }),
      );
    });

    it("denies a non-volunteer as unavailable when the admin group can't be read", async () => {
      // They might be an admin we can't see, so we can't say 'not a volunteer'.
      const client = seededClient();
      const read = client.listGroupContacts.bind(client);
      client.listGroupContacts = async (id) => {
        if (id === MOCK_ADMIN_GROUP_ID) throw new TidyError(500, "boom");
        return read(id);
      };
      expect(await access(client, "c_dante")).toEqual({
        status: "unavailable",
      });
    });

    it("on a non-TidyHQ failure, logging only the error's name", async () => {
      const client = seededClient();
      client.listGroupContacts = async () => {
        throw new TypeError("fetch failed: Bearer secret-token");
      };
      expect(await access(client, "c_pat")).toEqual({ status: "unavailable" });
      expect(error).toHaveBeenCalledWith("volunteer access unavailable", {
        contactId: "c_pat",
        group: "helper",
        reason: "read_failed",
        errorName: "TypeError",
      });
      expect(JSON.stringify(error.mock.calls)).not.toContain("secret-token");
    });
  });
});
