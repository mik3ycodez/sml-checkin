import { describe, expect, it } from "vitest";
import { TidyError } from "../tidyhq/errors";
import { MockTidyClient } from "../tidyhq/mock/MockTidyClient";
import { createSeed } from "../tidyhq/mock/seed";
import type { Contact } from "../tidyhq/types";
import {
  ATTENDEE_REFRESH_LEAD_MINUTES,
  attendeeRefreshSeconds,
  getEventAttendees,
  refreshIntervalSeconds,
} from "./attendees";
import type { AdminEventPage } from "./eventPage";

const NOW = new Date("2026-10-12T18:00:00Z");
const MINUTE = 60_000;

function clientWith(edit: (seed: ReturnType<typeof createSeed>) => void) {
  const seed = createSeed(NOW);
  edit(seed);
  return new MockTidyClient(seed, () => NOW);
}

function named(c: Contact, fields: Partial<Contact>): Contact {
  return Object.assign(c, fields);
}

describe("getEventAttendees", () => {
  it("lists the group's contacts alphabetically by name", async () => {
    // The seed's pub night has Marcus Bell and Jordan Park, in that order.
    const people = await getEventAttendees(
      clientWith(() => {}),
      "grp_pub_night",
    );
    expect(people).toEqual([
      { id: "c_jordan", name: "Jordan Park" },
      { id: "c_marcus", name: "Marcus Bell" },
    ]);
  });

  it("sorts without regard to case or accents", async () => {
    const client = clientWith((seed) => {
      named(
        seed.contacts.find((c) => c.id === "c_marcus")!,
        {
          display_name: "émile",
        },
      );
      named(
        seed.contacts.find((c) => c.id === "c_jordan")!,
        {
          display_name: "Zed",
        },
      );
      named(
        seed.contacts.find((c) => c.id === "c_dante")!,
        {
          display_name: "adam",
        },
      );
    });
    await client.addContactToGroup("grp_pub_night", "c_dante");
    const people = await getEventAttendees(client, "grp_pub_night");
    expect(people.map((p) => p.name)).toEqual(["adam", "émile", "Zed"]);
  });

  it("is an empty list, not a missing one, when nobody has checked in", async () => {
    expect(
      await getEventAttendees(
        clientWith(() => {}),
        "grp_social_night",
      ),
    ).toEqual([]);
  });

  it("falls back to first and last name, then to a placeholder, for a blank display name", async () => {
    const client = clientWith((seed) => {
      named(
        seed.contacts.find((c) => c.id === "c_marcus")!,
        {
          display_name: "   ",
        },
      );
      named(
        seed.contacts.find((c) => c.id === "c_jordan")!,
        {
          display_name: "",
          first_name: "",
          last_name: "",
        },
      );
    });
    const people = await getEventAttendees(client, "grp_pub_night");
    expect(people.map((p) => p.name)).toEqual([
      "Marcus Bell",
      "Unnamed member",
    ]);
  });

  it("doesn't let one contact with null name fields break the list", async () => {
    const client = clientWith((seed) => {
      Object.assign(
        seed.contacts.find((c) => c.id === "c_marcus")!,
        {
          display_name: null,
          first_name: "Marcus",
          last_name: null,
        },
      );
      Object.assign(
        seed.contacts.find((c) => c.id === "c_jordan")!,
        {
          display_name: null,
          first_name: null,
          last_name: null,
        },
      );
    });
    const people = await getEventAttendees(client, "grp_pub_night");
    expect(people.map((p) => p.name)).toEqual(["Marcus", "Unnamed member"]);
  });

  it("lists a contact once even if the client returns it twice", async () => {
    // Live paging can repeat a row when the group changes between pages.
    const client = clientWith(() => {});
    const read = client.listGroupContacts.bind(client);
    client.listGroupContacts = async (id) => {
      const contacts = await read(id);
      return [...contacts, contacts[0], ...contacts];
    };
    const people = await getEventAttendees(client, "grp_pub_night");
    expect(people).toEqual([
      { id: "c_jordan", name: "Jordan Park" },
      { id: "c_marcus", name: "Marcus Bell" },
    ]);
  });

  it("lists every attendee the client returns, one row each", async () => {
    // The client's contract is to follow every page; the list must be all of it.
    const client = clientWith(() => {});
    const many: Contact[] = Array.from({ length: 250 }, (_, i) => ({
      ...structuredClone(
        createSeed(NOW).contacts.find((c) => c.id === "c_marcus")!,
      ),
      id: `c_${i}`,
      display_name: `Member ${String(i).padStart(3, "0")}`,
    }));
    client.listGroupContacts = async () => many;
    expect(await getEventAttendees(client, "grp_pub_night")).toHaveLength(250);
  });

  it("reads the group it's given and nothing else", async () => {
    const client = clientWith(() => {});
    const asked: string[] = [];
    const read = client.listGroupContacts.bind(client);
    client.listGroupContacts = async (id) => {
      asked.push(id);
      return read(id);
    };
    await getEventAttendees(client, "grp_pub_night");
    expect(asked).toEqual(["grp_pub_night"]);
  });

  it("lets a TidyHQ failure through for the page to handle", async () => {
    const client = clientWith(() => {});
    client.listGroupContacts = async () => {
      throw new TidyError(503, "down");
    };
    await expect(getEventAttendees(client, "grp_pub_night")).rejects.toThrow(
      "down",
    );
  });
});

describe("attendeeRefreshSeconds", () => {
  const page = (
    checkin: AdminEventPage["checkin"],
    opensInMinutes: number | null = null,
  ) => ({
    checkin,
    window: {
      opensAt:
        opensInMinutes === null
          ? null
          : new Date(NOW.getTime() + opensInMinutes * MINUTE),
      closesAt: new Date(NOW.getTime() + 600 * MINUTE),
      source: "event" as const,
    },
  });

  it("refreshes every 30 seconds while check-in is open", () => {
    expect(refreshIntervalSeconds()).toBe(30);
    expect(attendeeRefreshSeconds(page("open", -10), NOW)).toBe(30);
  });

  it("refreshes when check-in is about to open, and not before", () => {
    const lead = ATTENDEE_REFRESH_LEAD_MINUTES;
    expect(attendeeRefreshSeconds(page("not_yet", lead), NOW)).toBe(30);
    expect(attendeeRefreshSeconds(page("not_yet", 1), NOW)).toBe(30);
    expect(attendeeRefreshSeconds(page("not_yet", lead + 1), NOW)).toBeNull();
    expect(attendeeRefreshSeconds(page("not_yet", 24 * 60), NOW)).toBeNull();
  });

  it("stops once check-in has closed", () => {
    expect(attendeeRefreshSeconds(page("closed", -300), NOW)).toBeNull();
  });

  it("never refreshes when members can't check in at all", () => {
    expect(attendeeRefreshSeconds(page("unavailable", -10), NOW)).toBeNull();
    expect(attendeeRefreshSeconds(page("unavailable", 5), NOW)).toBeNull();
  });

  it("doesn't refresh a not-yet event whose opening time is unknown", () => {
    expect(attendeeRefreshSeconds(page("not_yet", null), NOW)).toBeNull();
  });
});

describe("refreshIntervalSeconds", () => {
  it("is 30 seconds in production", () => {
    expect(refreshIntervalSeconds({ NODE_ENV: "production" })).toBe(30);
    expect(refreshIntervalSeconds({})).toBe(30);
  });

  it("is 2 seconds only when E2E is exactly 1", () => {
    expect(refreshIntervalSeconds({ E2E: "1" })).toBe(2);
    for (const E2E of ["", "0", "true", "2"]) {
      expect(refreshIntervalSeconds({ E2E })).toBe(30);
    }
  });
});
