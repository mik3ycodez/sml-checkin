import { describe, expect, it } from "vitest";
import { TidyError } from "../tidyhq/errors";
import { MockTidyClient } from "../tidyhq/mock/MockTidyClient";
import { createSeed, MOCK_ADMIN_GROUP_ID } from "../tidyhq/mock/seed";
import { groupFromSetting, readGroupMembers } from "./groupAccess";

const NOW = new Date("2026-10-12T18:00:00Z");
const seeded = () => new MockTidyClient(createSeed(NOW), () => NOW);

describe("groupFromSetting", () => {
  it("trims, and falls back to the default in mock mode only", () => {
    expect(groupFromSetting(" 5 ", "dflt", "live")).toEqual({ id: "5" });
    expect(groupFromSetting("", "dflt", "mock")).toEqual({ id: "dflt" });
    expect(groupFromSetting(undefined, "dflt", "live")).toEqual({
      problem: "not_configured",
    });
    expect(groupFromSetting("a/b", "dflt", "mock")).toEqual({
      problem: "invalid",
    });
  });
});

describe("readGroupMembers", () => {
  it("returns the members", async () => {
    const result = await readGroupMembers(seeded(), {
      id: MOCK_ADMIN_GROUP_ID,
    });
    expect("members" in result && result.members.map((c) => c.id)).toEqual([
      "c_casey",
    ]);
  });

  it("describes an unusable id without reading", async () => {
    expect(await readGroupMembers(seeded(), { problem: "invalid" })).toEqual({
      failure: { reason: "invalid" },
    });
  });

  it("describes a TidyHQ failure by status and message", async () => {
    const client = seeded();
    client.listGroupContacts = async () => {
      throw new TidyError(503, "down");
    };
    expect(await readGroupMembers(client, { id: "g" })).toEqual({
      failure: { reason: "read_failed", tidyStatus: 503, message: "down" },
    });
  });

  it("describes any other failure by name only, never its message", async () => {
    const client = seeded();
    client.listGroupContacts = async () => {
      throw new TypeError("Bearer secret-token");
    };
    const result = await readGroupMembers(client, { id: "g" });
    expect(result).toEqual({
      failure: { reason: "read_failed", errorName: "TypeError" },
    });
    expect(JSON.stringify(result)).not.toContain("secret-token");
  });
});
