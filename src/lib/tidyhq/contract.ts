import { describe, expect, it } from "vitest";
import type { TidyClient } from "./client";
import { TidyError } from "./errors";
import { createSeed, type MockSeed } from "./mock/seed";

/**
 * One set of tests for everything `TidyClient` promises, run against every
 * implementation: `MockTidyClient` directly, and `HttpTidyClient` talking to
 * the fake TidyHQ server. The same seed and the same expectations, so a
 * behavior one has and the other lacks fails a test. Reads only for now.
 *
 * `make` builds a fresh client over the given seed, plus a way to get a valid
 * member token for a seed contact. Seeds here are extended in the tests
 * themselves (more members, more memberships) so lists run past the fake
 * server's small pages.
 */
export interface ContractHarness {
  client: TidyClient;
  memberToken(contactId: string): string;
}

/** The moment the seed is built around; matches the mock's own tests. */
export const CONTRACT_NOW = new Date("2026-10-12T18:00:00Z");

function seedWith(change?: (seed: MockSeed) => void): MockSeed {
  const seed = createSeed(CONTRACT_NOW);
  change?.(seed);
  return seed;
}

/** Shared with the mock's own tests. */
export async function expectTidyError(
  promise: Promise<unknown>,
  status: number,
) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(TidyError);
  expect((error as TidyError).status).toBe(status);
}

const ids = (items: Array<{ id: string }>) => items.map((i) => i.id);
const sortedIds = (items: Array<{ id: string }>) => ids(items).sort();

export function runTidyClientContract(
  name: string,
  make: (seed: MockSeed) => ContractHarness,
): void {
  const open = (change?: (seed: MockSeed) => void) => make(seedWith(change));

  describe(`${name} meets the TidyClient contract`, () => {
    describe("getMe", () => {
      it("returns the contact for a valid member token", async () => {
        const { client, memberToken } = open();
        const me = await client.getMe(memberToken("c_marcus"));
        expect(me.id).toBe("c_marcus");
        expect(me.display_name).toBe("Marcus Bell");
      });

      it.each(["", "garbage"])("rejects token %j with 401", async (token) => {
        await expectTidyError(open().client.getMe(token), 401);
      });

      it("rejects a token for a contact that doesn't exist with 401", async () => {
        const { client, memberToken } = open();
        await expectTidyError(client.getMe(memberToken("c_nobody")), 401);
      });
    });

    describe("listAllContacts", () => {
      it("lists every active contact, and no inactive ones", async () => {
        const { client } = open((seed) => {
          seed.contacts[1].status = "inactive";
        });
        const all = await client.listAllContacts();
        expect(all).toHaveLength(11);
        expect(ids(all)).not.toContain("c_dante");
      });

      it("returns every contact however many pages that takes", async () => {
        const { client } = open((seed) => {
          for (let i = 0; i < 25; i++) {
            seed.contacts.push({
              ...structuredClone(seed.contacts[0]),
              id: `c_bulk_${i}`,
            });
          }
        });
        const all = await client.listAllContacts();
        expect(all).toHaveLength(37);
        expect(new Set(ids(all)).size).toBe(37);
      });

      it("returns whole contacts, with their custom fields", async () => {
        const { client } = open();
        const taylor = (await client.listAllContacts()).find(
          (c) => c.id === "c_taylor",
        )!;
        expect(taylor.display_name).toBe("Taylor Brandt");
        expect(taylor.custom_fields.cf_sml_points.value).toBe("18");
      });
    });

    describe("searchContacts", () => {
      it("finds a member by first name", async () => {
        const found = await open().client.searchContacts("Dante");
        expect(ids(found)).toEqual(["c_dante"]);
      });

      it("finds a member by last name", async () => {
        const found = await open().client.searchContacts("Okafor");
        expect(ids(found)).toEqual(["c_sam"]);
      });

      it("ignores case and surrounding spaces", async () => {
        const found = await open().client.searchContacts("  mARcUs  ");
        expect(ids(found)).toEqual(["c_marcus"]);
      });

      it("matches part of a name", async () => {
        const found = ids(await open().client.searchContacts("ar"));
        expect(found).toContain("c_marcus"); // Marcus
        expect(found).toContain("c_lee"); // Hart
        expect(found).not.toContain("c_dante");
      });

      it("needs every word to match, in any order", async () => {
        const { client } = open();
        expect(ids(await client.searchContacts("park jordan"))).toEqual([
          "c_jordan",
        ]);
        expect(await client.searchContacts("Jordan Bell")).toEqual([]);
      });

      it("matches an email address", async () => {
        const found = await open().client.searchContacts("riley@example");
        expect(ids(found)).toEqual(["c_riley"]);
      });

      it("returns an empty list when nobody matches", async () => {
        expect(await open().client.searchContacts("Zzyzx")).toEqual([]);
      });

      it("returns an empty list for a blank query, not everyone", async () => {
        const { client } = open();
        expect(await client.searchContacts("")).toEqual([]);
        expect(await client.searchContacts("   ")).toEqual([]);
      });

      it("skips inactive contacts, as TidyHQ does by default", async () => {
        const { client } = open((seed) => {
          seed.contacts.find((c) => c.id === "c_dante")!.status = "inactive";
        });
        expect(await client.searchContacts("Dante")).toEqual([]);
      });

      it("follows every page of a wide match", async () => {
        // Every seed email ends in example.com: 12 matches over 6 small pages.
        const found = await open().client.searchContacts("example.com");
        expect(found).toHaveLength(12);
      });

      it("handles punctuation in a name", async () => {
        const { client } = open((seed) => {
          seed.contacts.find((c) => c.id === "c_dante")!.last_name =
            "O'Brien & Sons";
        });
        const found = await client.searchContacts("O'Brien & Sons");
        expect(ids(found)).toEqual(["c_dante"]);
      });
    });

    describe("getContact", () => {
      it("returns a contact by id", async () => {
        const contact = await open().client.getContact("c_dante");
        expect(contact.first_name).toBe("Dante");
        expect(contact.custom_fields.cf_sml_points.value).toBe("0");
      });

      it("404s on an unknown contact", async () => {
        await expectTidyError(open().client.getContact("c_nobody"), 404);
      });
    });

    describe("memberships", () => {
      it("returns a contact's memberships with their dates and state", async () => {
        const [membership] = await open().client.getMemberships("c_avery");
        expect(membership.state).toBe("partial");
        expect(membership.contact_id).toBe("c_avery");
        expect(membership.end_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });

      it("returns every membership however many pages that takes", async () => {
        const { client } = open((seed) => {
          const template = seed.memberships.find(
            (m) => m.contact_id === "c_marcus",
          )!;
          for (let i = 0; i < 6; i++) {
            seed.memberships.push({ ...template, id: `m_bulk_${i}` });
          }
        });
        const found = await client.getMemberships("c_marcus");
        expect(found).toHaveLength(7);
        expect(new Set(ids(found)).size).toBe(7);
      });

      it("returns an empty list for a contact with no memberships", async () => {
        const { client } = open((seed) => {
          seed.memberships = seed.memberships.filter(
            (m) => m.contact_id !== "c_dante",
          );
        });
        expect(await client.getMemberships("c_dante")).toEqual([]);
      });

      it("404s on an unknown contact", async () => {
        await expectTidyError(open().client.getMemberships("c_nobody"), 404);
      });

      it("resolves membership level names", async () => {
        const { client } = open();
        const [membership] = await client.getMemberships("c_jordan");
        const level = await client.getMembershipLevel(
          membership.membership_level_id,
        );
        expect(level.name).toBe("Associate Member");
      });

      it("404s on an unknown membership level", async () => {
        await expectTidyError(
          open().client.getMembershipLevel("lvl_nope"),
          404,
        );
      });
    });

    describe("events", () => {
      it("lists events sorted by start time", async () => {
        const events = await open().client.listEvents();
        expect(ids(events)).toEqual([
          "ev_pub_night",
          "ev_tonight",
          "ev_bootblack_social",
          "ev_bar_night",
          "ev_leather_brunch",
        ]);
      });

      it("orders by the moment each starts, whatever offset its text uses, and puts an event with no start last", async () => {
        const { client } = open((seed) => {
          const template = seed.events.find((e) => e.id === "ev_bar_night")!;
          // 18:00Z written with an offset, so as text it sorts before 17:30Z.
          seed.events = [
            {
              ...template,
              id: "ev_offset",
              start_at: "2026-11-20T10:00:00-08:00",
              end_at: "2026-11-20T12:00:00-08:00",
            },
            {
              ...template,
              id: "ev_utc",
              start_at: "2026-11-20T17:30:00Z",
              end_at: "2026-11-20T19:00:00Z",
            },
            { ...template, id: "ev_nostart", start_at: null, end_at: null },
          ];
        });
        expect(ids(await client.listEvents())).toEqual([
          "ev_utc",
          "ev_offset",
          "ev_nostart",
        ]);
      });

      it("filters to events that end after `after`", async () => {
        const upcoming = await open().client.listEvents({
          after: CONTRACT_NOW,
        });
        expect(upcoming).toHaveLength(4);
        expect(upcoming.every((e) => new Date(e.end_at!) > CONTRACT_NOW)).toBe(
          true,
        );
      });

      it("filters to events that start before `before`", async () => {
        const past = await open().client.listEvents({ before: CONTRACT_NOW });
        expect(ids(past)).toEqual(["ev_pub_night", "ev_tonight"]);
      });

      it("combines `after` and `before`", async () => {
        const events = await open().client.listEvents({
          after: CONTRACT_NOW,
          before: CONTRACT_NOW,
        });
        expect(ids(events)).toEqual(["ev_tonight"]);
      });

      it("gets an event by id", async () => {
        const event = await open().client.getEvent("ev_bar_night");
        expect(event.name).toBe("Monthly Bar Night");
        expect(event.archived).toBe(false);
        expect(event.location).toBe("The Cuff Complex");
      });

      it("keeps an archived event archived", async () => {
        const { client } = open((seed) => {
          seed.events.find((e) => e.id === "ev_pub_night")!.archived = true;
        });
        expect((await client.getEvent("ev_pub_night")).archived).toBe(true);
      });

      it("404s on an unknown event", async () => {
        await expectTidyError(open().client.getEvent("ev_nope"), 404);
      });
    });

    describe("groups", () => {
      it("lists the contacts in a group", async () => {
        const contacts = await open().client.listGroupContacts("grp_pub_night");
        expect(sortedIds(contacts)).toEqual(["c_jordan", "c_marcus"]);
      });

      it("names the people in a group", async () => {
        const contacts = await open().client.listGroupContacts("grp_app_admin");
        expect(contacts.map((c) => c.display_name)).toEqual(["Casey Moreno"]);
      });

      it("lists an empty group as empty", async () => {
        expect(await open().client.listGroupContacts("grp_bar_night")).toEqual(
          [],
        );
      });

      it("returns every contact in a big group, once each", async () => {
        const { client } = open((seed) => {
          seed.groups.push({ ...seed.groups[0], id: "grp_big", size: 9 });
          seed.groupMembers.grp_big = seed.contacts
            .slice(0, 9)
            .map((c) => c.id);
        });
        const contacts = await client.listGroupContacts("grp_big");
        expect(contacts).toHaveLength(9);
        expect(new Set(ids(contacts)).size).toBe(9);
      });

      it('includes inactive contacts: check-in\'s "already checked in" test reads this list', async () => {
        const { client } = open((seed) => {
          seed.contacts.find((c) => c.id === "c_jordan")!.status = "inactive";
        });
        const contacts = await client.listGroupContacts("grp_pub_night");
        expect(sortedIds(contacts)).toEqual(["c_jordan", "c_marcus"]);
        expect(contacts.find((c) => c.id === "c_jordan")!.status).toBe(
          "inactive",
        );
      });

      it("404s on an unknown group", async () => {
        await expectTidyError(open().client.listGroupContacts("grp_nope"), 404);
      });

      it("lists a contact's groups, past events' and others", async () => {
        const groups = await open().client.listContactGroups("c_marcus");
        // Pub Night was last month; its group is still listed. Non-event
        // groups come back too, and callers must filter.
        expect(sortedIds(groups)).toEqual([
          "grp_members",
          "grp_pub_night",
          "grp_volunteers",
        ]);
        const members = groups.find((g) => g.id === "grp_members")!;
        expect(members.label).toBe("Members");
        expect(members.size).toBe(3);
      });

      it("lists no groups a contact isn't in", async () => {
        const groups = await open().client.listContactGroups("c_dante");
        expect(ids(groups)).not.toContain("grp_pub_night");
        expect(ids(groups)).toEqual(["grp_members"]);
      });

      it("returns every group of a contact in many groups", async () => {
        const { client } = open((seed) => {
          for (let i = 0; i < 7; i++) {
            seed.groups.push({
              ...seed.groups[0],
              id: `grp_extra_${i}`,
              size: 1,
            });
            seed.groupMembers[`grp_extra_${i}`] = ["c_dante"];
          }
        });
        const groups = await client.listContactGroups("c_dante");
        expect(groups).toHaveLength(8);
        expect(new Set(ids(groups)).size).toBe(8);
      });

      it("404s on listing the groups of an unknown contact", async () => {
        await expectTidyError(open().client.listContactGroups("c_nobody"), 404);
      });
    });
  });
}
