import { describe, expect, it } from "vitest";
import {
  findContact,
  MAX_SEARCH_RESULTS,
  MIN_SEARCH_LENGTH,
  searchMembers,
} from "./contacts";
import { TidyError } from "./errors";
import { MockTidyClient } from "./mock/MockTidyClient";
import { createSeed } from "./mock/seed";
import type { Contact } from "./types";

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

describe("searchMembers", () => {
  async function manyContacts(count: number): Promise<Contact[]> {
    const [template] = await seededClient().searchContacts("Dante");
    return Array.from({ length: count }, (_, i) => ({
      ...template,
      id: `c_${i}`,
    }));
  }

  it("uses a 2-character minimum and a 20-result cap", () => {
    expect(MIN_SEARCH_LENGTH).toBe(2);
    expect(MAX_SEARCH_RESULTS).toBe(20);
  });

  it("returns the matches", async () => {
    const result = await searchMembers(seededClient(), "Dante");
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.contacts.map((c) => c.id)).toEqual(["c_dante"]);
    }
  });

  it("returns an empty list when nobody matches", async () => {
    expect(await searchMembers(seededClient(), "Zzyzx")).toEqual({
      status: "ok",
      contacts: [],
    });
  });

  it("refuses a query under 2 characters, even one that would match everyone", async () => {
    for (const query of ["", " ", "e", "  e  "]) {
      expect(await searchMembers(seededClient(), query)).toEqual({
        status: "too_short",
      });
    }
  });

  it("never sends a too-short query to TidyHQ", async () => {
    const client = seededClient();
    let calls = 0;
    client.searchContacts = async () => {
      calls++;
      return [];
    };
    await searchMembers(client, " e ");
    expect(calls).toBe(0);
  });

  it("sends the trimmed query", async () => {
    const client = seededClient();
    const seen: string[] = [];
    client.searchContacts = async (q) => {
      seen.push(q);
      return [];
    };
    await searchMembers(client, "  Dante ");
    expect(seen).toEqual(["Dante"]);
  });

  it("returns exactly 20 matches", async () => {
    const client = seededClient();
    const contacts = await manyContacts(20);
    client.searchContacts = async () => contacts;
    const result = await searchMembers(client, "ex");
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.contacts).toHaveLength(20);
  });

  it("says too many for 21 matches and returns no names", async () => {
    const client = seededClient();
    const contacts = await manyContacts(21);
    client.searchContacts = async () => contacts;
    expect(await searchMembers(client, "ex")).toEqual({
      status: "too_many",
    });
  });

  it("lets TidyHQ errors through", async () => {
    const client = seededClient();
    client.searchContacts = async () => {
      throw new TidyError(503, "TidyHQ unavailable");
    };
    await expect(searchMembers(client, "Dante")).rejects.toBeInstanceOf(
      TidyError,
    );
  });
});
