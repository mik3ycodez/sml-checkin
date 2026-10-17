// Hand-written responses in the shapes TidyHQ's published specs describe
// (v2: https://api.tidyhq.com/v2/openapi.json, v1: .../v1/openapi.json), to
// check the client reads the real field names, and copes with the nulls and
// omissions the mock never produces.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contactName } from "../contactName";
import { readPoints } from "../customFields";
import { isTidyError } from "../errors";
import { HttpTidyClient } from "./HttpTidyClient";

type Routes = Record<string, unknown>;

/** A client whose fetch answers `routes` (path with version -> body). Lists are one page, then empty. */
function clientFor(routes: Routes, status = 200) {
  const fetchFn = async (url: string | URL | Request) => {
    const u = new URL(String(url));
    const key = u.pathname;
    if (!(key in routes)) throw new Error(`no fixture for ${key}`);
    const body = routes[key];
    const offset = Number(u.searchParams.get("offset") ?? 0);
    if (Array.isArray(body) && offset > 0) return Response.json([]);
    return Response.json(body, { status });
  };
  return new HttpTidyClient({
    adminToken: "tok",
    fetch: fetchFn as typeof fetch,
    sleep: async () => {},
  });
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("v2 Contact", () => {
  const spec = {
    id: "5821",
    contact_id_reference: 5821,
    display_name: "Marcus Bell",
    first_name: "Marcus",
    last_name: "Bell",
    nick_name: "",
    company: "",
    email_address: "marcus@example.com",
    website: null,
    metadata: null,
    kind: "person",
    created_at: "2025-01-03T04:05:06.000Z",
    updated_at: "2026-09-01T10:00:00.000Z",
    member_since: "2025-01-03",
    status: "active",
    user: { id: "u1", is_primary: true, email_address: "m@example.com" },
    organization: { id: "o1", name: "SML", domain_prefix: "sml" },
    contact_links: [],
    groups: [{ id: "77", label: "Members" }],
    notes: [
      {
        id: "n1",
        author_id: "9",
        text: "Hi",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        author: { id: "9" },
      },
    ],
    custom_fields: {
      cf_sml_points: {
        id: "cf_sml_points",
        title: "SML Points",
        type: "string",
        value: "12",
      },
      f_colors: {
        id: "f_colors",
        title: "Colors",
        type: "string",
        value: null,
      },
      f_flag: { id: "f_flag", title: "Flag", type: "boolean", value: true },
    },
  };

  it("reads the fields the app uses, by their spec names", async () => {
    const c = await clientFor({ "/v2/contacts/5821": spec }).getContact("5821");
    expect(c).toMatchObject({
      id: "5821",
      display_name: "Marcus Bell",
      first_name: "Marcus",
      last_name: "Bell",
      nick_name: "",
      email_address: "marcus@example.com",
      status: "active",
      member_since: "2025-01-03",
      created_at: "2025-01-03T04:05:06.000Z",
      updated_at: "2026-09-01T10:00:00.000Z",
    });
    expect(c.notes).toEqual([
      expect.objectContaining({ id: "n1", author_id: "9", text: "Hi" }),
    ]);
  });

  it("keeps custom fields keyed by id, with their values", async () => {
    const c = await clientFor({ "/v2/contacts/5821": spec }).getContact("5821");
    expect(readPoints(c)).toBe(12);
    expect(c.custom_fields.cf_sml_points).toEqual({
      id: "cf_sml_points",
      title: "SML Points",
      type: "string",
      value: "12",
    });
    expect(c.custom_fields.f_flag.value).toBe(true);
  });

  it("reads an unanswered field (null value) as blank", async () => {
    const c = await clientFor({ "/v2/contacts/5821": spec }).getContact("5821");
    expect(c.custom_fields.f_colors.value).toBe("");
  });

  it("leaves out a field TidyHQ sent without a value, rather than invent one", async () => {
    const c = await clientFor({
      "/v2/contacts/1": {
        id: "1",
        custom_fields: { f_x: { id: "f_x", title: "X", type: "string" } },
      },
    }).getContact("1");
    expect(c.custom_fields).toEqual({});
  });

  it("copes with nulls and omissions: names fall back, lists and fields are empty", async () => {
    const c = await clientFor({
      "/v2/contacts/2": {
        id: 2,
        display_name: null,
        first_name: "Pat",
        last_name: null,
        email_address: null,
      },
    }).getContact("2");
    expect(c.id).toBe("2");
    expect(contactName(c)).toBe("Pat");
    expect(c.email_address).toBe("");
    expect(c.custom_fields).toEqual({});
    expect(c.notes).toEqual([]);
    expect(
      contactName(
        await clientFor({ "/v2/contacts/3": { id: "3" } }).getContact("3"),
      ),
    ).toBe("Unnamed member");
  });

  it("reads an empty custom_fields list, as some servers send for none", async () => {
    const c = await clientFor({
      "/v2/contacts/4": { id: "4", custom_fields: [] },
    }).getContact("4");
    expect(c.custom_fields).toEqual({});
  });

  it("502s on a record with no id", async () => {
    const error = await clientFor({
      "/v2/contacts/5": { display_name: "No id" },
    })
      .getContact("5")
      .catch((e) => e);
    expect(isTidyError(error, 502)).toBe(true);
  });
});

describe("v2 Membership and Membership-Level", () => {
  const membership = {
    id: "m1",
    state: "partial",
    status: "Partial",
    auto_renew: false,
    membership_level_id: "12",
    contact_id: "5821",
    adult_members_contact_ids: ["5821"],
    child_members_contact_ids: [],
    start_date: "2026-01-02",
    end_date: "2027-01-01",
    created_at: "2026-01-02T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    notes: [],
  };

  it("reads a membership by its spec names", async () => {
    const [m] = await clientFor({
      "/v2/contacts/5821/memberships": [membership],
    }).getMemberships("5821");
    expect(m).toMatchObject({
      id: "m1",
      state: "partial",
      status: "Partial",
      membership_level_id: "12",
      contact_id: "5821",
      start_date: "2026-01-02",
      end_date: "2027-01-01",
    });
  });

  it("keeps null dates and a null contact as null", async () => {
    const [m] = await clientFor({
      "/v2/contacts/1/memberships": [
        { ...membership, contact_id: null, start_date: null, end_date: null },
      ],
    }).getMemberships("1");
    expect([m.contact_id, m.start_date, m.end_date]).toEqual([
      null,
      null,
      null,
    ]);
  });

  it("converts a numeric level id to a string", async () => {
    const [m] = await clientFor({
      "/v2/contacts/1/memberships": [
        { ...membership, membership_level_id: 12 },
      ],
    }).getMemberships("1");
    expect(m.membership_level_id).toBe("12");
  });

  it.each(["activated", "partial", "expired", "pending", "cancelled"])(
    "keeps the known state %s",
    async (state) => {
      const [m] = await clientFor({
        "/v2/contacts/1/memberships": [{ ...membership, state }],
      }).getMemberships("1");
      expect(m.state).toBe(state);
    },
  );

  it("treats a state it doesn't know as pending, which never counts, and says so", async () => {
    const [m] = await clientFor({
      "/v2/contacts/1/memberships": [{ ...membership, state: "suspended" }],
    }).getMemberships("1");
    expect(m.state).toBe("pending");
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).toContain("m1");
  });

  it("reads a level, with a null description", async () => {
    const level = await clientFor({
      "/v2/membership_levels/12": {
        id: "12",
        name: "Full Member",
        description: null,
        duration: 1,
        unit_period: "year",
        visible: "anyone",
      },
    }).getMembershipLevel("12");
    expect(level).toEqual({ id: "12", name: "Full Member", description: null });
  });
});

describe("v2 Event", () => {
  const event = {
    id: "9001",
    name: "Pub Night",
    start_at: "2026-10-17T02:00:00.000Z",
    end_at: "2026-10-17T05:00:00.000Z",
    body: "<p>Come</p>",
    location: "The Eagle",
    category_id: null,
    public: true,
    visible: "anyone",
    visible_to: [],
    image: "https://example.com/i.png",
    public_url: "https://sml.tidyhq.com/public/events/9001",
    archived: false,
    group_id: "444",
    shared_from: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-02T00:00:00Z",
  };

  it("reads an event by its spec names, group_id included", async () => {
    const e = await clientFor({ "/v2/events/9001": event }).getEvent("9001");
    expect(e).toEqual({
      id: "9001",
      name: "Pub Night",
      start_at: "2026-10-17T02:00:00.000Z",
      end_at: "2026-10-17T05:00:00.000Z",
      body: "<p>Come</p>",
      location: "The Eagle",
      public: true,
      archived: false,
      group_id: "444",
      shared_from: null,
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-02T00:00:00Z",
    });
  });

  it("reads shared_from when an event was shared in", async () => {
    const e = await clientFor({
      "/v2/events/1": {
        ...event,
        shared_from: { id: "o2", name: "Other Club" },
      },
    }).getEvent("1");
    expect(e.shared_from).toEqual({ id: "o2", name: "Other Club" });
  });

  it("keeps nulls the spec allows", async () => {
    const e = await clientFor({
      "/v2/events/2": {
        ...event,
        name: null,
        start_at: null,
        end_at: null,
        body: null,
        location: null,
        group_id: null,
      },
    }).getEvent("2");
    expect([
      e.name,
      e.start_at,
      e.end_at,
      e.body,
      e.location,
      e.group_id,
    ]).toEqual([null, null, null, null, null, null]);
  });

  it("treats an event with no archived flag as archived, so check-in refuses it", async () => {
    const { archived: _omitted, ...withoutFlag } = event;
    void _omitted;
    const e = await clientFor({ "/v2/events/3": withoutFlag }).getEvent("3");
    expect(e.archived).toBe(true);
  });

  it("reads an omitted public flag as not public", async () => {
    const { public: _omitted, ...withoutFlag } = event;
    void _omitted;
    const e = await clientFor({ "/v2/events/4": withoutFlag }).getEvent("4");
    expect(e.public).toBe(false);
  });

  it("lists events sorted by start, a null start first, as the mock does", async () => {
    const list = await clientFor({
      "/v2/events": [
        { ...event, id: "b", start_at: "2026-11-01T00:00:00Z" },
        { ...event, id: "n", start_at: null },
        { ...event, id: "a", start_at: "2026-10-01T00:00:00Z" },
      ],
    }).listEvents();
    expect(list.map((e) => e.id)).toEqual(["n", "a", "b"]);
  });
});

describe("v1 Group", () => {
  const group = {
    id: 123,
    label: "Attendees: Pub Night",
    description: "Event attendance",
    created_at: "2012-12-16 21:01:22 +0000",
    contacts_count: 7,
    logo_image: "https://example.com/g.png",
  };

  it("reads a group: numeric id as a string, contacts_count as size, ISO time", async () => {
    const [g] = await clientFor({
      "/v1/contacts/5821/groups": [group],
    }).listContactGroups("5821");
    expect(g).toEqual({
      id: "123",
      label: "Attendees: Pub Night",
      description: "Event attendance",
      size: 7,
      created_at: "2012-12-16T21:01:22.000Z",
    });
  });

  it("converts a v1 time with a non-zero offset", async () => {
    const [g] = await clientFor({
      "/v1/contacts/1/groups": [
        { ...group, created_at: "2012-12-16 21:01:22 -0800" },
      ],
    }).listContactGroups("1");
    expect(g.created_at).toBe("2012-12-17T05:01:22.000Z");
  });

  it("copes with a missing description, count and time", async () => {
    const [g] = await clientFor({
      "/v1/contacts/1/groups": [{ id: 5, label: "Bare" }],
    }).listContactGroups("1");
    expect(g).toMatchObject({
      id: "5",
      label: "Bare",
      description: "",
      size: 0,
    });
    expect(typeof g.created_at).toBe("string");
  });
});

describe("v1 Contact (group members)", () => {
  const member = {
    id: "5821",
    contact_id: 5821,
    first_name: "Marcus",
    last_name: "Bell",
    nick_name: "",
    display_name: "Marcus Bell",
    email_address: "marcus@example.com",
    status: "active",
    member_since: "2025-01-03",
    created_at: "2025-01-03 04:05:06 +0000",
    updated_at: "2026-09-01 10:00:00 +0000",
    custom_fields: [
      {
        id: "cf_sml_points",
        title: "SML Points",
        type: "string",
        created_at: "2025-01-03 04:05:06 +0000",
      },
    ],
    groups: [{ id: 77, label: "Members" }],
  };

  it("reads names, status and times (converted to ISO)", async () => {
    const [c] = await clientFor({
      "/v1/groups/77/contacts": [member],
    }).listGroupContacts("77");
    expect(c).toMatchObject({
      id: "5821",
      display_name: "Marcus Bell",
      first_name: "Marcus",
      status: "active",
      member_since: "2025-01-03",
      created_at: "2025-01-03T04:05:06.000Z",
      updated_at: "2026-09-01T10:00:00.000Z",
    });
    expect(c.notes).toEqual([]);
  });

  it("does not invent a points value from a field list that has no values", async () => {
    const [c] = await clientFor({
      "/v1/groups/77/contacts": [member],
    }).listGroupContacts("77");
    expect(c.custom_fields).toEqual({});
  });

  it("keeps a field value if TidyHQ does send one", async () => {
    const [c] = await clientFor({
      "/v1/groups/77/contacts": [
        {
          ...member,
          custom_fields: [
            { id: "cf_sml_points", title: "P", type: "string", value: "5" },
          ],
        },
      ],
    }).listGroupContacts("77");
    expect(c.custom_fields.cf_sml_points.value).toBe("5");
  });

  it("copes with a bare member, so one odd row can't break the list", async () => {
    const [c] = await clientFor({
      "/v1/groups/77/contacts": [{ id: 9 }],
    }).listGroupContacts("77");
    expect(c.id).toBe("9");
    expect(contactName(c)).toBe("Unnamed member");
    expect(c.custom_fields).toEqual({});
  });
});

describe("Error bodies", () => {
  it("turns TidyHQ's { message } into a TidyError with that status", async () => {
    const error = await clientFor(
      { "/v2/contacts/9": { message: "Contact not found" } },
      404,
    )
      .getContact("9")
      .catch((e) => e);
    expect(isTidyError(error, 404)).toBe(true);
    expect((error as Error).message).toContain("Contact not found");
  });
});
