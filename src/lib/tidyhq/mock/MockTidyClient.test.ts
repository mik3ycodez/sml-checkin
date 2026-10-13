import { beforeEach, describe, expect, it } from "vitest";
import { buildPointsPatch, POINTS_FIELD_ID, readPoints } from "../customFields";
import { TidyError } from "../errors";
import { resolveEventGroup } from "../eventGroups";
import { issueMockToken, MockTidyClient } from "./MockTidyClient";
import { createSeed, MOCK_ADMIN_CONTACT_ID } from "./seed";

const NOW = new Date("2026-10-12T18:00:00Z");

function daysBetween(from: Date, isoDate: string): number {
  return Math.round((new Date(isoDate).getTime() - from.getTime()) / 86_400_000);
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
        "ev_bootblack_social",
        "ev_bar_night",
        "ev_leather_brunch",
      ]);
    });

    it("filters to upcoming events with `after`", async () => {
      const upcoming = await client.listEvents({ after: NOW });
      expect(upcoming).toHaveLength(3);
      expect(upcoming.every((e) => new Date(e.end_at!) > NOW)).toBe(true);
    });

    it("filters with `before`", async () => {
      const past = await client.listEvents({ before: NOW });
      expect(past.map((e) => e.id)).toEqual(["ev_pub_night"]);
    });

    it("gets an event by id", async () => {
      const event = await client.getEvent("ev_bar_night");
      expect(event.name).toBe("Monthly Bar Night");
    });

    it("404s on an unknown event", async () => {
      await expectTidyError(client.getEvent("ev_nope"), 404);
    });

    it("maps every seed event to an existing group", async () => {
      for (const event of await client.listEvents()) {
        const groupId = resolveEventGroup(event);
        await expect(client.listGroupContacts(groupId)).resolves.toBeDefined();
      }
    });
  });

  describe("groups", () => {
    it("lists past attendees", async () => {
      const contacts = await client.listGroupContacts("grp_pub_night");
      expect(contacts.map((c) => c.id).sort()).toEqual(["c_jordan", "c_marcus"]);
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

    it("404s on an unknown group or contact", async () => {
      await expectTidyError(client.listGroupContacts("grp_nope"), 404);
      await expectTidyError(client.addContactToGroup("grp_nope", "c_dante"), 404);
      await expectTidyError(
        client.addContactToGroup("grp_bar_night", "c_nobody"),
        404,
      );
    });
  });

  describe("points custom field", () => {
    it("persists a points update", async () => {
      const updated = await client.updateContact("c_dante", buildPointsPatch(3));
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
      const note = await client.addNote("c_jordan", "Staff check-in: Bar Night");
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
});
