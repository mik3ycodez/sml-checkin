import { describe, expect, it } from "vitest";
import { TidyError } from "../tidyhq/errors";
import { MockTidyClient } from "../tidyhq/mock/MockTidyClient";
import { createSeed } from "../tidyhq/mock/seed";
import type { Contact } from "../tidyhq/types";
import {
  ATTENDEE_REFRESH_LEAD_MINUTES,
  ATTENDEE_REFRESH_SECONDS,
  attendeeRefreshSeconds,
  getEventAttendees,
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
  it("counts the group's contacts and lists their names alphabetically", async () => {
    // The seed's pub night has Marcus Bell and Jordan Park, in that order.
    const view = await getEventAttendees(
      clientWith(() => {}),
      "ev_pub_night",
    );
    expect(view).toEqual({
      kind: "list",
      count: 2,
      people: [
        { id: "c_jordan", name: "Jordan Park" },
        { id: "c_marcus", name: "Marcus Bell" },
      ],
    });
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
    const view = await getEventAttendees(client, "ev_pub_night");
    expect(view.kind === "list" && view.people.map((p) => p.name)).toEqual([
      "adam",
      "émile",
      "Zed",
    ]);
  });

  it("is an empty list, not a missing one, when nobody has checked in", async () => {
    expect(
      await getEventAttendees(
        clientWith(() => {}),
        "ev_tonight",
      ),
    ).toEqual({ kind: "list", count: 0, people: [] });
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
    const view = await getEventAttendees(client, "ev_pub_night");
    expect(view.kind === "list" && view.people.map((p) => p.name)).toEqual([
      "Marcus Bell",
      "Unnamed member",
    ]);
  });

  it("counts every attendee the client returns, one row each", async () => {
    // The client's contract is to follow every page; the count must be all of it.
    const client = clientWith(() => {});
    const many: Contact[] = Array.from({ length: 250 }, (_, i) => ({
      ...structuredClone(
        createSeed(NOW).contacts.find((c) => c.id === "c_marcus")!,
      ),
      id: `c_${i}`,
      display_name: `Member ${String(i).padStart(3, "0")}`,
    }));
    client.listGroupContacts = async () => many;
    const view = await getEventAttendees(client, "ev_pub_night");
    expect(view.kind === "list" && view.count).toBe(250);
    expect(view.kind === "list" && view.people).toHaveLength(250);
  });

  it("reads the event's group and nothing else", async () => {
    const client = clientWith(() => {});
    const asked: string[] = [];
    const read = client.listGroupContacts.bind(client);
    client.listGroupContacts = async (id) => {
      asked.push(id);
      return read(id);
    };
    await getEventAttendees(client, "ev_pub_night");
    expect(asked).toEqual(["grp_pub_night"]);
  });

  it("says there's no group, without reading, for an event with none", async () => {
    const client = clientWith(() => {});
    client.listGroupContacts = async () => {
      throw new Error("must not read");
    };
    expect(await getEventAttendees(client, "ev_nope")).toEqual({
      kind: "no_group",
    });
  });

  it("lets a TidyHQ failure through for the page to handle", async () => {
    const client = clientWith(() => {});
    client.listGroupContacts = async () => {
      throw new TidyError(503, "down");
    };
    await expect(getEventAttendees(client, "ev_pub_night")).rejects.toThrow(
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
    expect(ATTENDEE_REFRESH_SECONDS).toBe(30);
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
