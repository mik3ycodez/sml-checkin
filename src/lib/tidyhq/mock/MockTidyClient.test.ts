import { beforeEach, describe, expect, it } from "vitest";
import { buildPointsPatch, readPoints } from "../customFields";
import { getCheckinWindow, isCheckinOpen } from "../checkinWindow";
import { expectTidyError, runTidyClientContract } from "../contract";
import { findEventGroup } from "../eventGroups";
import { issueMockToken, MockTidyClient } from "./MockTidyClient";
import { createSeed } from "./seed";

const NOW = new Date("2026-10-12T18:00:00Z");

function daysBetween(from: Date, isoDate: string): number {
  return Math.round(
    (new Date(isoDate).getTime() - from.getTime()) / 86_400_000,
  );
}

runTidyClientContract("MockTidyClient", (seed) => ({
  client: new MockTidyClient(seed, () => NOW),
  memberToken: issueMockToken,
  differences: {
    eventGroupLinked: true,
    missingPointsUnreadable: false,
    missingIssuedUnreadable: false,
    checkinWindows: true,
  },
}));

describe("MockTidyClient", () => {
  let client: MockTidyClient;

  beforeEach(() => {
    client = new MockTidyClient(createSeed(NOW), () => NOW);
  });

  describe("listSignInContacts (mock only)", () => {
    it("lists every seed contact, for the fake sign-in page", async () => {
      const ids = (await client.listSignInContacts()).map((c) => c.id);
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
        "c_kai",
      ]);
    });

    it("has an App Admin group with only Casey Moreno in it", async () => {
      const admins = await client.listGroupContacts("grp_app_admin");
      expect(admins.map((c) => c.display_name)).toEqual(["Casey Moreno"]);
    });
  });

  describe("searchContacts", () => {
    it("returns copies, so callers can't change the mock", async () => {
      const [found] = await client.searchContacts("Dante");
      found.first_name = "Changed";
      expect((await client.getContact("c_dante")).first_name).toBe("Dante");
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
  });

  describe("events", () => {
    it("has a Social Night happening right now", async () => {
      const event = await client.getEvent("ev_tonight");
      expect(event.name).toBe("Social Night");
      expect(new Date(event.start_at!) <= NOW).toBe(true);
      expect(new Date(event.end_at!) > NOW).toBe(true);
    });

    it("maps every seed event but the no-group one to an existing group", async () => {
      for (const event of await client.listEvents()) {
        if (event.id === "ev_no_group") {
          expect(findEventGroup(event)).toBeNull();
          continue;
        }
        const groupId = findEventGroup(event);
        expect(groupId, event.id).not.toBeNull();
        await expect(client.listGroupContacts(groupId!)).resolves.toBeDefined();
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
    it("lists group members by identity only, since v1 sends no field values", async () => {
      const [first] = await client.listGroupContacts("grp_pub_night");
      expect(first.display_name).not.toBe("");
      expect(first.custom_fields).toEqual({});
      expect(first.notes).toEqual([]);
      // The points are still on the contact itself.
      expect(readPoints(await client.getContact(first.id))).toBe(1);
    });

    it("describes a group with only what v1 sends", async () => {
      const [group] = await client.listContactGroups("c_marcus");
      expect(Object.keys(group).sort()).toEqual([
        "created_at",
        "description",
        "id",
        "label",
        "size",
      ]);
    });
  });

  describe("points custom field", () => {
    it("seeds points consistent with past attendance", async () => {
      expect(readPoints(await client.getContact("c_marcus"))).toBe(1);
      expect(readPoints(await client.getContact("c_dante"))).toBe(0);
    });

    it("reads an unset field as 0", () => {
      expect(readPoints({ custom_fields: {} })).toBe(0);
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
