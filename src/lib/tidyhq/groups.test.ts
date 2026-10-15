import { describe, expect, it } from "vitest";
import { TidyError } from "./errors";
import { isInGroup } from "./groups";
import { MockTidyClient } from "./mock/MockTidyClient";
import { createSeed } from "./mock/seed";

const NOW = new Date("2026-10-12T18:00:00Z");

function seededClient() {
  return new MockTidyClient(createSeed(NOW), () => NOW);
}

describe("isInGroup", () => {
  it("is true for a contact in the group", async () => {
    expect(await isInGroup(seededClient(), "grp_pub_night", "c_marcus")).toBe(
      true,
    );
  });

  it("is false for a contact not in the group", async () => {
    expect(await isInGroup(seededClient(), "grp_pub_night", "c_dante")).toBe(
      false,
    );
  });

  it("lets TidyHQ errors through", async () => {
    const client = seededClient();
    client.listGroupContacts = async () => {
      throw new TidyError(503, "TidyHQ unavailable");
    };
    await expect(
      isInGroup(client, "grp_pub_night", "c_marcus"),
    ).rejects.toBeInstanceOf(TidyError);
  });
});
