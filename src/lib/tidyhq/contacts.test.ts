import { describe, expect, it } from "vitest";
import { findContact } from "./contacts";
import { TidyError } from "./errors";
import { MockTidyClient } from "./mock/MockTidyClient";
import { createSeed } from "./mock/seed";

const NOW = new Date("2026-10-12T18:00:00Z");

function seededClient() {
  return new MockTidyClient(createSeed(NOW), () => NOW);
}

describe("findContact", () => {
  it("returns the contact", async () => {
    const contact = await findContact(seededClient(), "c_dante");
    expect(contact?.display_name).toBe("Dante Ruiz");
  });

  it("returns null for a contact TidyHQ doesn't have", async () => {
    expect(await findContact(seededClient(), "c_nobody")).toBeNull();
  });

  it("lets other TidyHQ errors through", async () => {
    const client = seededClient();
    client.getContact = async () => {
      throw new TidyError(503, "TidyHQ unavailable");
    };
    await expect(findContact(client, "c_dante")).rejects.toBeInstanceOf(
      TidyError,
    );
  });
});
