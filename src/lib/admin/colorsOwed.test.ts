import { describe, expect, it, vi } from "vitest";
import {
  COLORS_ISSUED_FIELD_ID,
  POINTS_FIELD_ID,
} from "../tidyhq/customFields";
import { TidyError } from "../tidyhq/errors";
import { MockTidyClient } from "../tidyhq/mock/MockTidyClient";
import { createSeed, type MockSeed } from "../tidyhq/mock/seed";
import { getColorsOwed } from "./colorsOwed";

const NOW = new Date("2026-10-12T18:00:00Z");

function clientWith(edit?: (seed: MockSeed) => void) {
  const seed = createSeed(NOW);
  edit?.(seed);
  return new MockTidyClient(seed, () => NOW);
}

function setField(
  seed: MockSeed,
  contactId: string,
  field: string,
  value: string,
) {
  seed.contacts.find((c) => c.id === contactId)!.custom_fields[field].value =
    value;
}

const names = (list: { name: string }[]) => list.map((m) => m.name);

describe("getColorsOwed", () => {
  it("lists a current member at exactly 18 points who isn't issued", async () => {
    const report = await getColorsOwed(clientWith(), { now: NOW });
    expect(report.ready).toEqual([
      expect.objectContaining({
        contactId: "c_taylor",
        name: "Taylor Brandt",
        points: 18,
        standing: "current",
      }),
    ]);
    expect(report.renewFirst).toEqual([]);
    expect(report.needsChecking).toEqual([]);
  });

  it("leaves out 17 points, and a member already issued (25 points)", async () => {
    const report = await getColorsOwed(clientWith(), { now: NOW });
    const all = names([...report.ready, ...report.renewFirst]);
    expect(all).not.toContain("Riley Frost");
    expect(all).not.toContain("Morgan Hale");
  });

  it("leaves out someone issued under 18 points, and checks nothing else about them", async () => {
    const client = clientWith((seed) => {
      setField(seed, "c_dante", COLORS_ISSUED_FIELD_ID, "yes");
      setField(seed, "c_dante", POINTS_FIELD_ID, "3");
    });
    const report = await getColorsOwed(client, { now: NOW });
    expect(names(report.needsChecking)).not.toContain("Dante Ruiz");
    expect(names(report.ready)).not.toContain("Dante Ruiz");
  });

  it("leaves out someone issued even if their points are unreadable", async () => {
    const client = clientWith((seed) => {
      setField(seed, "c_morgan", POINTS_FIELD_ID, "lots");
    });
    const report = await getColorsOwed(client, { now: NOW });
    expect(names(report.needsChecking)).toEqual([]);
  });

  it("splits by standing: current first, the rest to renew or pay", async () => {
    const client = clientWith((seed) => {
      for (const id of ["c_robin", "c_lee", "c_avery", "c_marcus"]) {
        setField(seed, id, POINTS_FIELD_ID, "20");
      }
      // Never joined: points but no membership.
      seed.memberships = seed.memberships.filter(
        (m) => m.contact_id !== "c_dante",
      );
      setField(seed, "c_dante", POINTS_FIELD_ID, "30");
    });
    const report = await getColorsOwed(client, { now: NOW });
    expect(names(report.ready)).toEqual(["Marcus Bell", "Taylor Brandt"]);
    expect(report.renewFirst.map((m) => [m.name, m.standing])).toEqual([
      ["Avery Quinn", "balance_due"],
      ["Dante Ruiz", "non_member"],
      ["Lee Hart", "lapsed"],
      ["Robin Vale", "grace"],
    ]);
  });

  it("puts unreadable points, or an unreadable issued field that matters, under needs checking", async () => {
    const client = clientWith((seed) => {
      setField(seed, "c_jordan", POINTS_FIELD_ID, "1.5");
      setField(seed, "c_sam", POINTS_FIELD_ID, "-4");
      setField(seed, "c_sam", COLORS_ISSUED_FIELD_ID, "?");
      // 18 points, issued field unreadable: could be owed, can't tell.
      setField(seed, "c_taylor", COLORS_ISSUED_FIELD_ID, "maybe");
      // Unreadable issued field and points readable but just under 18.
      setField(seed, "c_riley", COLORS_ISSUED_FIELD_ID, "Y");
    });
    const report = await getColorsOwed(client, { now: NOW });
    expect(report.needsChecking.map((m) => [m.name, m.problem])).toEqual([
      ["Jordan Park", "points"],
      ["Sam Okafor", "both"],
      ["Taylor Brandt", "issued"],
    ]);
    expect(report.ready).toEqual([]);
  });

  it("doesn't flag an unreadable issued field when points are under 18", async () => {
    const client = clientWith((seed) => {
      setField(seed, "c_dante", COLORS_ISSUED_FIELD_ID, "maybe");
    });
    const report = await getColorsOwed(client, { now: NOW });
    expect(names(report.needsChecking)).toEqual([]);
  });

  it("leaves out a contact whose memberships TidyHQ 404s, and logs only the id", async () => {
    const client = clientWith();
    const real = client.getMemberships.bind(client);
    vi.spyOn(client, "getMemberships").mockImplementation(async (id) => {
      if (id === "c_taylor") throw new TidyError(404, "Taylor Brandt gone");
      return real(id);
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const report = await getColorsOwed(client, { now: NOW });
    expect(report.ready).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).toContain("c_taylor");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("Taylor");
    warn.mockRestore();
  });

  it("carries each person's email, or null, so rows can be told apart", async () => {
    const client = clientWith((seed) => {
      setField(seed, "c_jordan", POINTS_FIELD_ID, "x");
      seed.contacts.find((c) => c.id === "c_jordan")!.email_address =
        null as unknown as string;
    });
    const report = await getColorsOwed(client, { now: NOW });
    expect(report.ready[0].email).toBe("taylor@example.com");
    expect(report.needsChecking[0].email).toBeNull();
  });

  it("sorts by name within groups and names contacts with contactName", async () => {
    const client = clientWith((seed) => {
      setField(seed, "c_marcus", POINTS_FIELD_ID, "19");
      const marcus = seed.contacts.find((c) => c.id === "c_marcus")!;
      marcus.display_name = null as unknown as string;
      marcus.first_name = "Aaron";
      marcus.last_name = "Zed";
      const jordan = seed.contacts.find((c) => c.id === "c_jordan")!;
      jordan.display_name = " ";
      jordan.first_name = "";
      jordan.last_name = "";
      setField(seed, "c_jordan", POINTS_FIELD_ID, "x");
    });
    const report = await getColorsOwed(client, { now: NOW });
    expect(names(report.ready)).toEqual(["Aaron Zed", "Taylor Brandt"]);
    expect(names(report.needsChecking)).toEqual(["Unnamed member"]);
  });

  it("ignores inactive contacts", async () => {
    const client = clientWith((seed) => {
      seed.contacts.find((c) => c.id === "c_taylor")!.status = "inactive";
    });
    const report = await getColorsOwed(client, { now: NOW });
    expect(report.ready).toEqual([]);
  });

  it("fails as a whole when TidyHQ fails, rather than returning a partial list", async () => {
    const client = clientWith();
    vi.spyOn(client, "getMemberships").mockRejectedValue(
      new TidyError(500, "boom"),
    );
    await expect(getColorsOwed(client, { now: NOW })).rejects.toBeInstanceOf(
      TidyError,
    );
    const failing = clientWith();
    vi.spyOn(failing, "listAllContacts").mockRejectedValue(
      new TidyError(503, "down"),
    );
    await expect(getColorsOwed(failing, { now: NOW })).rejects.toBeInstanceOf(
      TidyError,
    );
  });

  it("does not read memberships for anyone who can't be listed", async () => {
    const client = clientWith();
    const spy = vi.spyOn(client, "getMemberships");
    await getColorsOwed(client, { now: NOW });
    expect(spy.mock.calls.map((c) => c[0])).toEqual(["c_taylor"]);
  });
});
