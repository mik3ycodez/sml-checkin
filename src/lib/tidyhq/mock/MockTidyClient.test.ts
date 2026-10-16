import { beforeEach, describe, expect, it } from "vitest";
import { buildPointsPatch, POINTS_FIELD_ID, readPoints } from "../customFields";
import { getCheckinWindow, isCheckinOpen } from "../checkinWindow";
import { TidyError } from "../errors";
import { resolveEventGroup } from "../eventGroups";
import { issueMockToken, MockTidyClient } from "./MockTidyClient";
import { createSeed, MOCK_ADMIN_CONTACT_ID } from "./seed";

const NOW = new Date("2026-10-12T18:00:00Z");

function daysBetween(from: Date, isoDate: string): number {
  return Math.round(
    (new Date(isoDate).getTime() - from.getTime()) / 86_400_000,
  );
}

async function expectTidyError(promise: Promise<unknown>, status: number) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(TidyError);
  expect((error as TidyError).status).toBe(status);
}

describe("MockTidyClient", () => {
  let client: MockTidyClient;

  beforeEach(() => {
    client = new MockTidyClient(createSeed(NOW), () => NOW);
  });

  describe("getMe", () => {
    it("returns the contact for a valid member token", async () => {
      const me = await client.getMe(issueMockToken("c_marcus"));
      expect(me.id).toBe("c_marcus");
      expect(me.display_name).toBe("Marcus Bell");
    });

    it.each(["", "garbage", issueMockToken("c_nobody")])(
      "rejects token %j with 401",
      async (token) => {
        await expectTidyError(client.getMe(token), 401);
      },
    );
  });

  describe("listContacts (mock only)", () => {
    it("lists every seed contact, for the fake sign-in page", async () => {
      const ids = (await client.listContacts()).map((c) => c.id);
      expect(ids).toEqual([
        "c_marcus",
        "c_dante",
        "c_jordan",
        "c_sam",
        "c_lee",
        "c_robin",
        "c_avery",
        "c_riley",
        "c_taylor",
        "c_morgan",
        "c_casey",
        "c_pat",
      ]);
    });

    it("has an App Admin group with only Casey Moreno in it", async () => {
      const admins = await client.listGroupContacts("grp_app_admin");
      expect(admins.map((c) => c.display_name)).toEqual(["Casey Moreno"]);
    });
  });

  describe("searchContacts", () => {
    it("finds a member by first name", async () => {
      const found = await client.searchContacts("Dante");
      expect(found.map((c) => c.id)).toEqual(["c_dante"]);
    });

    it("finds a member by last name", async () => {
      const found = await client.searchContacts("Okafor");
      expect(found.map((c) => c.id)).toEqual(["c_sam"]);
    });

    it("ignores case and surrounding spaces", async () => {
      const found = await client.searchContacts("  mARcUs  ");
      expect(found.map((c) => c.id)).toEqual(["c_marcus"]);
    });

    it("matches part of a name", async () => {
      const found = await client.searchContacts("ar");
      const ids = found.map((c) => c.id);
      expect(ids).toContain("c_marcus"); // Marcus
      expect(ids).toContain("c_lee"); // Hart
      expect(ids).not.toContain("c_dante");
    });

    it("needs every word to match, in any order", async () => {
      const found = await client.searchContacts("park jordan");
      expect(found.map((c) => c.id)).toEqual(["c_jordan"]);
      expect(await client.searchContacts("Jordan Bell")).toEqual([]);
    });

    it("matches an email address", async () => {
      const found = await client.searchContacts("riley@example");
      expect(found.map((c) => c.id)).toEqual(["c_riley"]);
    });

    it("returns an empty list when nobody matches", async () => {
      expect(await client.searchContacts("Zzyzx")).toEqual([]);
    });

    it("returns an empty list for a blank query, not everyone", async () => {
      expect(await client.searchContacts("")).toEqual([]);
      expect(await client.searchContacts("   ")).toEqual([]);
    });

    it("skips inactive contacts, as TidyHQ does by default", async () => {
      const seed = createSeed(NOW);
      seed.contacts.find((c) => c.id === "c_dante")!.status = "inactive";
      const withInactive = new MockTidyClient(seed, () => NOW);
      expect(await withInactive.searchContacts("Dante")).toEqual([]);
    });

    it("returns copies, so callers can't change the mock", async () => {
      const [found] = await client.searchContacts("Dante");
      found.first_name = "Changed";
      expect((await client.getContact("c_dante")).first_name).toBe("Dante");
    });
  });

  describe("getContact", () => {
    it("returns a contact by id", async () => {
      const contact = await client.getContact("c_dante");
      expect(contact.first_name).toBe("Dante");
    });

    it("404s on an unknown contact", async () => {
      await expectTidyError(client.getContact("c_nobody"), 404);
    });
  });

  describe("memberships", () => {
    it("reports active members as activated", async () => {
      for (const id of ["c_marcus", "c_dante", "c_jordan", "c_sam"]) {
        const [membership] = await client.getMemberships(id);
        expect(membership.state, id).toBe("activated");
      }
    });

    it("reports the expired member as expired with a past end date", async () => {
      const [membership] = await client.getMemberships("c_lee");
      expect(membership.state).toBe("expired");
      expect(daysBetween(NOW, membership.end_date!)).toBeLessThan(0);
    });

    it("expired Lee well past the 60-day grace period, so refusals stay refusals", async () => {
      const [membership] = await client.getMemberships("c_lee");
      expect(daysBetween(NOW, membership.end_date!)).toBeLessThan(-60);
    });

    it("has a member about 20 days into the grace period", async () => {
      const [membership] = await client.getMemberships("c_robin");
      expect(membership.state).toBe("expired");
      // About 20 days: daysBetween counts from NOW's UTC time, not Seattle's date.
      const days = daysBetween(NOW, membership.end_date!);
      expect(days).toBeGreaterThanOrEqual(-21);
      expect(days).toBeLessThanOrEqual(-19);
    });

    it("has a partial member with a future end date", async () => {
      const [membership] = await client.getMemberships("c_avery");
      expect(membership.state).toBe("partial");
      expect(daysBetween(NOW, membership.end_date!)).toBeGreaterThan(30);
    });

    it("has one member expiring within 30 days (renewal reminder)", async () => {
      const [membership] = await client.getMemberships("c_sam");
      const daysLeft = daysBetween(NOW, membership.end_date!);
      expect(daysLeft).toBeGreaterThan(0);
      expect(daysLeft).toBeLessThanOrEqual(30);
    });

    it("resolves membership level names", async () => {
      const [membership] = await client.getMemberships("c_jordan");
      const level = await client.getMembershipLevel(
        membership.membership_level_id,
      );
      expect(level.name).toBe("Associate Member");
    });

    it("404s on an unknown membership level", async () => {
      await expectTidyError(client.getMembershipLevel("lvl_nope"), 404);
    });
  });

  describe("events", () => {
    it("lists events sorted by start time", async () => {
      const events = await client.listEvents();
      expect(events.map((e) => e.id)).toEqual([
        "ev_pub_night",
        "ev_tonight",
        "ev_bootblack_social",
        "ev_bar_night",
        "ev_leather_brunch",
      ]);
    });

    it("filters to upcoming events with `after`", async () => {
      const upcoming = await client.listEvents({ after: NOW });
      expect(upcoming).toHaveLength(4);
      expect(upcoming.every((e) => new Date(e.end_at!) > NOW)).toBe(true);
    });

    it("filters with `before`", async () => {
      const past = await client.listEvents({ before: NOW });
      expect(past.map((e) => e.id)).toEqual(["ev_pub_night", "ev_tonight"]);
    });

    it("gets an event by id", async () => {
      const event = await client.getEvent("ev_bar_night");
      expect(event.name).toBe("Monthly Bar Night");
    });

    it("404s on an unknown event", async () => {
      await expectTidyError(client.getEvent("ev_nope"), 404);
    });

    it("has a Social Night happening right now", async () => {
      const event = await client.getEvent("ev_tonight");
      expect(event.name).toBe("Social Night");
      expect(new Date(event.start_at!) <= NOW).toBe(true);
      expect(new Date(event.end_at!) > NOW).toBe(true);
    });

    it("maps every seed event to an existing group", async () => {
      for (const event of await client.listEvents()) {
        const groupId = resolveEventGroup(event);
        await expect(client.listGroupContacts(groupId)).resolves.toBeDefined();
      }
    });
  });

  describe("check-in windows", () => {
    it("returns the admin-set window for an event", async () => {
      const window = await client.getEventCheckinWindow("ev_leather_brunch");
      const event = await client.getEvent("ev_leather_brunch");
      expect(window).not.toBeNull();
      expect(new Date(window!.opens_at) < new Date(event.start_at!)).toBe(true);
      expect(new Date(window!.closes_at) > new Date(window!.opens_at)).toBe(
        true,
      );
    });

    it("has an open window for tonight's event", async () => {
      const window = await client.getEventCheckinWindow("ev_tonight");
      expect(new Date(window!.opens_at) <= NOW).toBe(true);
      expect(new Date(window!.closes_at) > NOW).toBe(true);
    });

    it("keeps tonight's event open for a day, since dev reuses one seed", async () => {
      const event = await client.getEvent("ev_tonight");
      const window = await getCheckinWindow(client, event);
      const later = new Date(NOW.getTime() + 23 * 60 * 60 * 1000);
      expect(isCheckinOpen(window, later)).toBe("open");
    });

    it("returns null for an event with no window set", async () => {
      expect(await client.getEventCheckinWindow("ev_bar_night")).toBeNull();
    });

    it("404s on an unknown event", async () => {
      await expectTidyError(client.getEventCheckinWindow("ev_nope"), 404);
    });
  });

  describe("seed dates", () => {
    // 05:00 UTC on the 13th is 10pm on the 12th in Seattle (PDT).
    const EVENING = new Date("2026-10-13T05:00:00Z");

    it("uses the Seattle calendar date, not the UTC date", () => {
      const seed = createSeed(EVENING);
      const sam = seed.memberships.find((m) => m.id === "m_sam")!;
      // Seattle "today" is 2026-10-12, so 14 days out is 2026-10-26.
      expect(sam.end_date).toBe("2026-10-26");
      const marcus = seed.contacts.find((c) => c.id === "c_marcus")!;
      expect(marcus.member_since).toBe("2025-10-12");
    });

    it("counts calendar days, so a DST change doesn't shift dates", () => {
      // 07:30 UTC on Feb 20 is 11:30pm Feb 19 in Seattle (PST). Dante's
      // membership ends 165 days later, across the March spring-forward.
      const seed = createSeed(new Date("2026-02-20T07:30:00Z"));
      const dante = seed.memberships.find((m) => m.id === "m_dante")!;
      expect(dante.end_date).toBe("2026-08-03");
    });
  });

  describe("groups", () => {
    it("lists past attendees", async () => {
      const contacts = await client.listGroupContacts("grp_pub_night");
      expect(contacts.map((c) => c.id).sort()).toEqual([
        "c_jordan",
        "c_marcus",
      ]);
    });

    it("adds a contact to a group", async () => {
      await client.addContactToGroup("grp_bar_night", "c_dante");
      const contacts = await client.listGroupContacts("grp_bar_night");
      expect(contacts.map((c) => c.id)).toEqual(["c_dante"]);
    });

    it("is idempotent when adding the same contact twice", async () => {
      await client.addContactToGroup("grp_bar_night", "c_dante");
      await client.addContactToGroup("grp_bar_night", "c_dante");
      const contacts = await client.listGroupContacts("grp_bar_night");
      expect(contacts).toHaveLength(1);
    });

    it("lists a contact's groups, archived and current, event or not", async () => {
      const groups = await client.listContactGroups("c_marcus");
      const byId = Object.fromEntries(groups.map((g) => [g.id, g]));
      // Pub Night was last month, so its group is archived but still listed.
      expect(byId.grp_pub_night.archived).toBe(true);
      // Non-event groups come back too; callers must filter.
      expect(byId.grp_members).toBeDefined();
      expect(byId.grp_members.archived).toBe(false);
    });

    it("lists a group for the current event once the contact checks in", async () => {
      await client.addContactToGroup("grp_social_night", "c_dante");
      const groups = await client.listContactGroups("c_dante");
      expect(groups.find((g) => g.id === "grp_social_night")?.archived).toBe(
        false,
      );
    });

    it("lists no groups a contact isn't in", async () => {
      const groups = await client.listContactGroups("c_dante");
      expect(groups.map((g) => g.id)).not.toContain("grp_pub_night");
    });

    it("404s on listing the groups of an unknown contact", async () => {
      await expectTidyError(client.listContactGroups("c_nobody"), 404);
    });

    it("404s on an unknown group or contact", async () => {
      await expectTidyError(client.listGroupContacts("grp_nope"), 404);
      await expectTidyError(
        client.addContactToGroup("grp_nope", "c_dante"),
        404,
      );
      await expectTidyError(
        client.addContactToGroup("grp_bar_night", "c_nobody"),
        404,
      );
    });
  });

  describe("points custom field", () => {
    it("persists a points update", async () => {
      const updated = await client.updateContact(
        "c_dante",
        buildPointsPatch(3),
      );
      expect(readPoints(updated)).toBe(3);
      expect(readPoints(await client.getContact("c_dante"))).toBe(3);
    });

    it("seeds points consistent with past attendance", async () => {
      expect(readPoints(await client.getContact("c_marcus"))).toBe(1);
      expect(readPoints(await client.getContact("c_dante"))).toBe(0);
    });

    it("rejects an unknown custom field with 422", async () => {
      await expectTidyError(
        client.updateContact("c_dante", { custom_fields: { cf_nope: "1" } }),
        422,
      );
    });

    it("stores points as a string field", () => {
      expect(buildPointsPatch(5)).toEqual({
        custom_fields: { [POINTS_FIELD_ID]: "5" },
      });
    });

    it("reads an unset field as 0", () => {
      expect(readPoints({ custom_fields: {} })).toBe(0);
    });
  });

  describe("notes", () => {
    it("adds a note authored by the admin", async () => {
      const note = await client.addNote(
        "c_jordan",
        "Staff check-in: Bar Night",
      );
      expect(note.author_id).toBe(MOCK_ADMIN_CONTACT_ID);
      expect(note.created_at).toBe(NOW.toISOString());
      const contact = await client.getContact("c_jordan");
      expect(contact.notes.map((n) => n.text)).toEqual([
        "Staff check-in: Bar Night",
      ]);
    });

    it("rejects an empty note with 422", async () => {
      await expectTidyError(client.addNote("c_jordan", "  "), 422);
    });
  });

  describe("isolation", () => {
    it("does not share state between instances", async () => {
      const other = new MockTidyClient(createSeed(NOW), () => NOW);
      await client.addContactToGroup("grp_bar_night", "c_dante");
      expect(await other.listGroupContacts("grp_bar_night")).toEqual([]);
    });

    it("returns copies that cannot mutate internal state", async () => {
      const contact = await client.getContact("c_dante");
      contact.first_name = "Changed";
      expect((await client.getContact("c_dante")).first_name).toBe("Dante");
    });
  });

  describe("reset (mock only)", () => {
    it("restores seed points and group members after changes", async () => {
      const original = await client.getContact("c_dante");
      await client.updateContact("c_dante", buildPointsPatch(5));
      await client.addContactToGroup("grp_social_night", "c_dante");

      client.reset();

      const restored = await client.getContact("c_dante");
      expect(readPoints(restored)).toBe(readPoints(original));
      const members = await client.listGroupContacts("grp_social_night");
      expect(members.map((c) => c.id)).not.toContain("c_dante");
    });

    it("can be reset more than once", async () => {
      await client.addContactToGroup("grp_social_night", "c_dante");
      client.reset();
      await client.addContactToGroup("grp_social_night", "c_dante");
      client.reset();
      expect(await client.listGroupContacts("grp_social_night")).toEqual([]);
    });
  });
});
