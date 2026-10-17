import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TidyClient } from "../client";
import { CONTRACT_NOW, runTidyClientContract } from "../contract";
import { isTidyError } from "../errors";
import { issueMockToken, MockTidyClient } from "../mock/MockTidyClient";
import { createSeed, type MockSeed } from "../mock/seed";
import { createFakeTidyServer, FAKE_ADMIN_TOKEN } from "./fakeTidyServer";
import { HttpTidyClient } from "./HttpTidyClient";

const noSleep = async () => {};

function build(seed: MockSeed = createSeed(CONTRACT_NOW), pageSize?: number) {
  const server = createFakeTidyServer(
    new MockTidyClient(seed, () => CONTRACT_NOW),
    { pageSize },
  );
  const client = new HttpTidyClient({
    adminToken: FAKE_ADMIN_TOKEN,
    fetch: server.fetch,
    sleep: noSleep,
  });
  return { server, client };
}

// No test may reach the real network: any stray global fetch fails the test.
let realFetchCalls: string[];
beforeEach(() => {
  realFetchCalls = [];
  vi.stubGlobal("fetch", (url: unknown) => {
    realFetchCalls.push(String(url));
    throw new Error("a test reached the real network");
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  expect(realFetchCalls).toEqual([]);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// The same tests the mock passes, through the fake TidyHQ server's pages of 2.
runTidyClientContract("HttpTidyClient", (seed) => ({
  client: build(seed).client,
  memberToken: issueMockToken,
}));

describe("HttpTidyClient", () => {
  describe("paging", () => {
    it("asks for page after page until an empty one", async () => {
      const { server, client } = build();
      expect(await client.listAllContacts()).toHaveLength(12);
      const offsets = server.requests.map((r) => r.query.get("offset"));
      // 12 contacts at 2 a page: six full pages, then the empty one.
      expect(offsets).toEqual(["0", "2", "4", "6", "8", "10", "12"]);
      expect(server.requests.every((r) => r.query.get("limit") === "100")).toBe(
        true,
      );
    });

    it("pages every list read, v1 and v2", async () => {
      const { server, client } = build();
      await client.searchContacts("example.com");
      await client.getMemberships("c_marcus");
      await client.listEvents();
      await client.listGroupContacts("grp_members");
      await client.listContactGroups("c_marcus");
      for (const req of server.requests) {
        expect(req.query.has("offset"), req.path).toBe(true);
      }
      // Each list ended on an empty page.
      const lasts = ["/contacts", "/contacts/c_marcus/memberships", "/events"];
      for (const path of lasts) {
        const forPath = server.requests.filter((r) => r.path === path);
        expect(forPath.length, path).toBeGreaterThan(1);
      }
    });

    it("throws, rather than return part of a list, when a later page fails", async () => {
      const { server, client } = build();
      server.intercept((req) =>
        req.path === "/groups/grp_members/contacts" &&
        req.query.get("offset") === "2"
          ? new Response("{}", { status: 500 })
          : undefined,
      );
      const error = await client
        .listGroupContacts("grp_members")
        .catch((e) => e);
      expect(isTidyError(error, 500)).toBe(true);
    });

    it("treats a list that isn't a list as TidyHQ failing", async () => {
      const { server, client } = build();
      server.intercept(() => Response.json({ contacts: [] }));
      const error = await client.listAllContacts().catch((e) => e);
      expect(isTidyError(error, 502)).toBe(true);
    });
  });

  describe("which token goes where", () => {
    it("sends the member's token to /contacts/me and nothing else", async () => {
      const { server, client } = build();
      const member = issueMockToken("c_marcus");
      await client.getMe(member);
      await client.getContact("c_marcus");
      await client.getMemberships("c_marcus");
      await client.getMembershipLevel("lvl_full");
      await client.listEvents();
      await client.getEvent("ev_tonight");
      await client.searchContacts("Marcus");
      await client.listAllContacts();
      await client.listGroupContacts("grp_members");
      await client.listContactGroups("c_marcus");

      for (const req of server.requests) {
        const isMe = req.path === "/contacts/me";
        expect(req.token, `${req.path}`).toBe(isMe ? member : FAKE_ADMIN_TOKEN);
      }
    });

    it("never puts a token in a URL", async () => {
      const { server, client } = build();
      const member = issueMockToken("c_marcus");
      await client.getMe(member);
      await client.listAllContacts();
      await client.listGroupContacts("grp_members");
      for (const req of server.requests) {
        expect(req.url).not.toContain(member);
        expect(req.url).not.toContain(FAKE_ADMIN_TOKEN);
        expect(req.query.has("access_token")).toBe(false);
      }
    });

    it("rejects a wrong admin token with 401", async () => {
      const { server } = build();
      const client = new HttpTidyClient({
        adminToken: "not-the-token",
        fetch: server.fetch,
        sleep: noSleep,
      });
      const error = await client.getContact("c_marcus").catch((e) => e);
      expect(isTidyError(error, 401)).toBe(true);
    });

    it("rejects a blank member token without calling TidyHQ", async () => {
      const { server, client } = build();
      const error = await client.getMe("  ").catch((e) => e);
      expect(isTidyError(error, 401)).toBe(true);
      expect(server.requests).toEqual([]);
    });
  });

  describe("requests", () => {
    it("uses v2 for contacts, memberships and events, and v1 for groups", async () => {
      const { server, client } = build();
      await client.getContact("c_marcus");
      await client.getMemberships("c_marcus");
      await client.getMembershipLevel("lvl_full");
      await client.getEvent("ev_tonight");
      await client.listGroupContacts("grp_members");
      await client.listContactGroups("c_marcus");
      const seen = new Set(server.requests.map((r) => `${r.version}${r.path}`));
      expect([...seen]).toEqual([
        "v2/contacts/c_marcus",
        "v2/contacts/c_marcus/memberships",
        "v2/membership_levels/lvl_full",
        "v2/events/ev_tonight",
        "v1/groups/grp_members/contacts",
        "v1/contacts/c_marcus/groups",
      ]);
    });

    it("asks for inactive contacts too in a group list, so check-in sees them", async () => {
      const { server, client } = build();
      await client.listGroupContacts("grp_members");
      for (const req of server.requests) {
        expect(req.query.get("show_all")).toBe("true");
      }
    });

    it("sends a blank search nowhere, since a blank search_terms may mean everyone", async () => {
      const { server, client } = build();
      expect(await client.searchContacts("")).toEqual([]);
      expect(await client.searchContacts("   ")).toEqual([]);
      expect(server.requests).toEqual([]);
    });

    it("sends the trimmed search text as search_terms", async () => {
      const { server, client } = build();
      await client.searchContacts("  Marcus Bell ");
      expect(server.requests[0].query.get("search_terms")).toBe("Marcus Bell");
    });

    it("sends after and before as ISO timestamps", async () => {
      const { server, client } = build();
      const after = new Date("2026-10-01T07:00:00Z");
      const before = new Date("2026-11-01T07:00:00Z");
      await client.listEvents({ after, before });
      const [first] = server.requests;
      expect(first.query.get("after")).toBe("2026-10-01T07:00:00.000Z");
      expect(first.query.get("before")).toBe("2026-11-01T07:00:00.000Z");
    });

    it("sends neither filter when none are asked for", async () => {
      const { server, client } = build();
      await client.listEvents();
      expect(server.requests[0].query.has("after")).toBe(false);
      expect(server.requests[0].query.has("before")).toBe(false);
    });

    it("sorts events by start time itself, since TidyHQ promises no order", async () => {
      const { server, client } = build(undefined, 10);
      const raw = await (
        await server.fetch("https://api.tidyhq.com/v2/events", {
          headers: { Authorization: `Bearer ${FAKE_ADMIN_TOKEN}` },
        })
      ).json();
      expect(raw[0].id).toBe("ev_leather_brunch"); // the fake sends newest first
      expect((await client.listEvents())[0].id).toBe("ev_pub_night");
    });

    it("returns each id once if TidyHQ repeats a row between pages", async () => {
      const { server, client } = build();
      let calls = 0;
      server.intercept((req) => {
        if (req.path !== "/groups/grp_members/contacts") return undefined;
        // Page 1 repeats c_marcus from page 0's end, as a shifting list might.
        calls++;
        if (calls === 1) {
          return Response.json([{ id: "c_marcus" }, { id: "c_dante" }]);
        }
        if (calls === 2) {
          return Response.json([{ id: "c_dante" }, { id: "c_jordan" }]);
        }
        return Response.json([]);
      });
      const contacts = await client.listGroupContacts("grp_members");
      expect(contacts.map((c) => c.id)).toEqual([
        "c_marcus",
        "c_dante",
        "c_jordan",
      ]);
    });
  });

  describe("failures", () => {
    it("404s on an unknown id with TidyHQ's message", async () => {
      const { client } = build();
      const error = await client.getContact("c_nobody").catch((e) => e);
      expect(isTidyError(error, 404)).toBe(true);
    });

    it("retries a read once after a 503, and then succeeds", async () => {
      const { server, client } = build();
      let failed = false;
      server.intercept((req) => {
        if (req.path !== "/events/ev_tonight" || failed) return undefined;
        failed = true;
        return new Response("{}", { status: 503 });
      });
      expect((await client.getEvent("ev_tonight")).id).toBe("ev_tonight");
      expect(server.requests).toHaveLength(2);
    });
  });

  describe("without an injected fetch", () => {
    it("uses the global fetch, against the fixed TidyHQ host", async () => {
      const calls: string[] = [];
      vi.stubGlobal("fetch", async (url: unknown) => {
        calls.push(String(url));
        return Response.json({ id: "ev_x", name: "X", archived: false });
      });
      const client = new HttpTidyClient({ adminToken: FAKE_ADMIN_TOKEN });
      await client.getEvent("ev_x");
      expect(calls).toEqual(["https://api.tidyhq.com/v2/events/ev_x"]);
    });
  });

  describe("writes are not built yet (milestone 5, PR 4)", () => {
    const attempts: Array<[string, (c: TidyClient) => Promise<unknown>]> = [
      ["updateContact", (c) => c.updateContact("c_marcus", {})],
      ["addNote", (c) => c.addNote("c_marcus", "hello")],
      [
        "addContactToGroup",
        (c) => c.addContactToGroup("grp_social_night", "c_marcus"),
      ],
      ["getEventCheckinWindow", (c) => c.getEventCheckinWindow("ev_tonight")],
    ];

    it.each(attempts)(
      "%s throws, naming itself, and calls nothing",
      async (name, attempt) => {
        const { server, client } = build();
        const error = await attempt(client).catch((e) => e);
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain(`HttpTidyClient.${name}`);
        expect((error as Error).message).toMatch(/not implemented/i);
        expect(server.requests).toEqual([]);
      },
    );
  });
});
