import { describe, expect, it } from "vitest";
import { issueMockToken, MockTidyClient } from "../mock/MockTidyClient";
import { createSeed } from "../mock/seed";
import { createFakeTidyServer, FAKE_ADMIN_TOKEN } from "./fakeTidyServer";

const V2 = "https://api.tidyhq.com/v2";
const V1 = "https://api.tidyhq.com/v1";

function setup(options?: { pageSize?: number }) {
  const server = createFakeTidyServer(
    new MockTidyClient(createSeed(new Date("2026-10-12T18:00:00Z"))),
    options,
  );
  const get = (url: string, token: string | null = FAKE_ADMIN_TOKEN) =>
    server.fetch(url, {
      method: "GET",
      headers: token === null ? {} : { Authorization: `Bearer ${token}` },
    });
  return { server, get };
}

describe("fake TidyHQ server", () => {
  describe("paging", () => {
    it("returns 2 items a page, however many are asked for", async () => {
      const { get } = setup();
      const page = await (
        await get(`${V2}/contacts?search_terms=example.com&limit=100&offset=0`)
      ).json();
      expect(page.map((c: { id: string }) => c.id)).toEqual([
        "c_marcus",
        "c_dante",
      ]);
    });

    it("honors offset, and returns an empty page past the end", async () => {
      const { get } = setup();
      const second = await (
        await get(`${V2}/contacts?search_terms=example.com&limit=100&offset=2`)
      ).json();
      expect(second.map((c: { id: string }) => c.id)).toEqual([
        "c_jordan",
        "c_sam",
      ]);
      expect(
        await (
          await get(`${V2}/contacts?search_terms=example.com&offset=500`)
        ).json(),
      ).toEqual([]);
    });

    it("uses a smaller limit when asked for one", async () => {
      const { get } = setup();
      const page = await (
        await get(`${V2}/contacts?search_terms=example.com&limit=1&offset=0`)
      ).json();
      expect(page).toHaveLength(1);
    });

    it("pages by the size it was built with", async () => {
      const { get } = setup({ pageSize: 5 });
      const page = await (
        await get(`${V2}/contacts?search_terms=example.com&limit=100`)
      ).json();
      expect(page).toHaveLength(5);
    });

    it("leaves inactive contacts out of a v1 group list unless show_all is sent", async () => {
      const server = createFakeTidyServer(
        new MockTidyClient(
          (() => {
            const seed = createSeed(new Date("2026-10-12T18:00:00Z"));
            seed.contacts.find((c) => c.id === "c_jordan")!.status = "inactive";
            return seed;
          })(),
        ),
        { pageSize: 10 },
      );
      const read = async (query: string) =>
        (
          await (
            await server.fetch(`${V1}/groups/grp_pub_night/contacts${query}`, {
              headers: { Authorization: `Bearer ${FAKE_ADMIN_TOKEN}` },
            })
          ).json()
        ).map((c: { id: string }) => c.id);
      expect(await read("")).toEqual(["c_marcus"]);
      expect(await read("?show_all=true")).toEqual(["c_marcus", "c_jordan"]);
    });

    it("pages the v1 lists too", async () => {
      const { get } = setup();
      const groups = await (
        await get(`${V1}/contacts/c_marcus/groups?limit=100&offset=2`)
      ).json();
      expect(groups).toHaveLength(1);
    });
  });

  describe("tokens", () => {
    it("401s with a message when there is no token", async () => {
      const { get } = setup();
      const res = await get(`${V2}/contacts`, null);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ message: expect.any(String) });
    });

    it("401s on any other token, a member's included", async () => {
      const { get } = setup();
      expect((await get(`${V2}/contacts`, "nope")).status).toBe(401);
      const member = issueMockToken("c_marcus");
      expect((await get(`${V2}/contacts`, member)).status).toBe(401);
      expect(
        (await get(`${V1}/groups/grp_members/contacts`, member)).status,
      ).toBe(401);
    });

    it("answers /contacts/me for a member's token, and only that", async () => {
      const { get } = setup();
      const res = await get(`${V2}/contacts/me`, issueMockToken("c_dante"));
      expect(res.status).toBe(200);
      expect((await res.json()).id).toBe("c_dante");
      expect((await get(`${V2}/contacts/me`, "garbage")).status).toBe(401);
      expect((await get(`${V2}/contacts/me`, FAKE_ADMIN_TOKEN)).status).toBe(
        401,
      );
    });
  });

  describe("errors and routes", () => {
    it("404s with a message for an unknown record", async () => {
      const { get } = setup();
      const res = await get(`${V2}/contacts/c_nobody`);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ message: expect.any(String) });
    });

    it("refuses loudly, not with a 404, for a path it doesn't know", async () => {
      const { get } = setup();
      await expect(get(`${V2}/contact/c_marcus`)).rejects.toThrow(/no route/i);
    });

    it("refuses loudly for a method it doesn't serve", async () => {
      const { server } = setup();
      await expect(
        server.fetch(`${V2}/contacts/c_dante`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${FAKE_ADMIN_TOKEN}` },
        }),
      ).rejects.toThrow(/no route/i);
    });

    it("refuses loudly for any host but TidyHQ's API", async () => {
      const { get } = setup();
      await expect(get("https://example.com/v2/contacts")).rejects.toThrow(
        /host/i,
      );
    });

    it("records every request, with its token", async () => {
      const { server, get } = setup();
      await get(`${V2}/contacts?search_terms=example.com&limit=2&offset=0`);
      expect(server.requests).toEqual([
        expect.objectContaining({
          method: "GET",
          version: "v2",
          path: "/contacts",
          token: FAKE_ADMIN_TOKEN,
          url: `${V2}/contacts?search_terms=example.com&limit=2&offset=0`,
        }),
      ]);
      expect(server.requests[0].query.get("offset")).toBe("0");
    });

    it("lets a test answer a request itself", async () => {
      const { server, get } = setup();
      server.intercept((req) =>
        req.path === "/contacts"
          ? new Response("<html>oops</html>", { status: 503 })
          : undefined,
      );
      expect((await get(`${V2}/contacts`)).status).toBe(503);
      expect((await get(`${V2}/events`)).status).toBe(200);
    });
  });

  describe("writes", () => {
    const send = (
      server: ReturnType<typeof setup>["server"],
      method: string,
      url: string,
      body?: unknown,
    ) =>
      server.fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${FAKE_ADMIN_TOKEN}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

    it("answers a group PUT with 204 and no body, as v1's spec says", async () => {
      const { server, get } = setup();
      const res = await send(
        server,
        "PUT",
        `${V1}/groups/grp_social_night/contacts/c_dante`,
      );
      expect(res.status).toBe(204);
      expect(await res.text()).toBe("");
      const members = await (
        await get(`${V1}/groups/grp_social_night/contacts?limit=10`)
      ).json();
      expect(members.map((c: { id: string }) => c.id)).toEqual(["c_dante"]);
    });

    it("answers a contact PATCH with the whole contact, 200", async () => {
      const { server } = setup();
      const res = await send(server, "PATCH", `${V2}/contacts/c_dante`, {
        custom_fields: { cf_sml_points: { value: "4" } },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe("c_dante");
      expect(body.custom_fields.cf_sml_points.value).toBe("4");
    });

    it("422s a custom field in the old bare-string shape", async () => {
      const { server } = setup();
      const res = await send(server, "PATCH", `${V2}/contacts/c_dante`, {
        custom_fields: { cf_sml_points: "4" },
      });
      expect(res.status).toBe(422);
    });

    it("answers a note POST with the note, 201", async () => {
      const { server } = setup();
      const res = await send(server, "POST", `${V2}/contacts/c_dante/notes`, {
        text: "hi",
      });
      expect(res.status).toBe(201);
      expect((await res.json()).text).toBe("hi");
    });

    it("records the body it was sent", async () => {
      const { server } = setup();
      await send(server, "POST", `${V2}/contacts/c_dante/notes`, {
        text: "hi",
      });
      expect(server.requests[0].body).toEqual({ text: "hi" });
    });

    it("lets a test see the real answer and then replace it (a write that happened, but the reply was lost)", async () => {
      const { server, get } = setup();
      server.interceptAfter((req) => {
        if (req.method === "PUT") throw new DOMException("t", "TimeoutError");
        return undefined;
      });
      await expect(
        send(server, "PUT", `${V1}/groups/grp_social_night/contacts/c_dante`),
      ).rejects.toThrow();
      const members = await (
        await get(`${V1}/groups/grp_social_night/contacts?limit=10`)
      ).json();
      expect(members).toHaveLength(1);
    });
  });

  describe("shapes follow the published spec, not the mock's", () => {
    it("sends v2 contacts with the spec's extra fields, and custom fields keyed by id", async () => {
      const { get } = setup();
      const contact = await (await get(`${V2}/contacts/c_marcus`)).json();
      expect(contact.full_name).toBe("Marcus Bell");
      expect(contact.user).toBeNull();
      expect(contact.custom_fields.cf_sml_points).toEqual(
        expect.objectContaining({ id: "cf_sml_points", value: "1" }),
      );
    });

    it("sends v2 events in no particular order (the spec promises none)", async () => {
      const { get } = setup({ pageSize: 10 });
      const events = await (await get(`${V2}/events`)).json();
      expect(events.map((e: { id: string }) => e.id)).toEqual([
        "ev_leather_brunch",
        "ev_bar_night",
        "ev_bootblack_social",
        "ev_no_group",
        "ev_tonight",
        "ev_pub_night",
      ]);
    });

    it("sends v1 groups as v1 does: contacts_count, no size or archived", async () => {
      const { get } = setup();
      const [group] = await (
        await get(`${V1}/contacts/c_marcus/groups`)
      ).json();
      expect(group.contacts_count).toEqual(expect.any(Number));
      expect(group).not.toHaveProperty("size");
      expect(group).not.toHaveProperty("archived");
      expect(group).not.toHaveProperty("updated_at");
      expect(group.created_at).toMatch(
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \+0000$/,
      );
    });

    it("sends v1 contacts with custom fields as a list that has no values", async () => {
      const { get } = setup();
      const [contact] = await (
        await get(`${V1}/groups/grp_pub_night/contacts`)
      ).json();
      expect(contact.display_name).toBeTruthy();
      expect(contact.custom_fields.length).toBeGreaterThan(0);
      for (const field of contact.custom_fields) {
        expect(field).not.toHaveProperty("value");
      }
      expect(contact.created_at).toMatch(/ \+0000$/);
    });
  });
});
