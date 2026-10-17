// Test-only: a `fetch` that answers like TidyHQ's API, over a MockTidyClient.
// Nothing in the app imports this.
//
// What it adds to the mock is the part the mock can't do: JSON bodies in the
// shapes the published specs describe (v2: https://api.tidyhq.com/v2/openapi.json,
// v1: https://api.tidyhq.com/v1/openapi.json), `limit`/`offset` paging,
// Bearer token checks and `{ "message" }` error bodies. Where the mock's
// domain objects differ from the spec, this file is where they get spec shape.
//
// Known gap: v1 group ids are numbers in the spec; the mock's are strings
// ("grp_pub_night"), and the fake passes them through. The client's conversion
// of a numeric id is covered by the fixture tests instead.

import { TidyError } from "../errors";
import type { MockTidyClient } from "../mock/MockTidyClient";
import type { Contact, ContactPatch, Event, Group } from "../types";

export const FAKE_ADMIN_TOKEN = "fake-admin-token";

/** Small on purpose: every seed list then spans several pages. */
const DEFAULT_PAGE_SIZE = 2;

export interface FakeRequest {
  method: string;
  version: "v1" | "v2";
  /** Path after the version, e.g. `/contacts/c_marcus`. */
  path: string;
  query: URLSearchParams;
  /** The Bearer token sent, or null. */
  token: string | null;
  /** The full URL as requested. */
  url: string;
  /** The JSON body sent, or undefined if there was none. */
  body?: unknown;
}

export interface FakeTidyServer {
  fetch: typeof fetch;
  /** Every request received, in order. */
  requests: FakeRequest[];
  /**
   * Answer some requests yourself (a failure, a bad body). Return undefined to
   * let the fake answer as usual. Handlers run in the order added.
   */
  intercept(handler: (req: FakeRequest) => Response | undefined): void;
  /**
   * Let the fake answer (so a write really happens), then replace the answer:
   * return a Response, or throw (a `TimeoutError` DOMException is a timeout)
   * to lose it, as a dropped connection would. Return undefined to leave it.
   */
  interceptAfter(
    handler: (req: FakeRequest, answer: Response) => Response | undefined,
  ): void;
}

export function createFakeTidyServer(
  mock: MockTidyClient,
  options: { adminToken?: string; pageSize?: number } = {},
): FakeTidyServer {
  const adminToken = options.adminToken ?? FAKE_ADMIN_TOKEN;
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const requests: FakeRequest[] = [];
  const handlers: Array<(req: FakeRequest) => Response | undefined> = [];
  const afterHandlers: Array<
    (req: FakeRequest, answer: Response) => Response | undefined
  > = [];

  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });

  function page<T>(items: T[], query: URLSearchParams): T[] {
    const asked = Number(query.get("limit"));
    const size = asked > 0 ? Math.min(asked, pageSize) : pageSize;
    const offset = Math.max(0, Number(query.get("offset")) || 0);
    return items.slice(offset, offset + size);
  }

  async function answer(req: FakeRequest): Promise<Response> {
    const parts = req.path.split("/").slice(1);
    const noRoute = () =>
      new Error(
        `fake TidyHQ: no route for ${req.method} /${req.version}${req.path}`,
      );
    if (req.method !== "GET") return answerWrite(req, parts, noRoute);

    // Identity is the one call made with a member's token.
    if (req.version === "v2" && req.path === "/contacts/me") {
      if (!req.token)
        return reply(401, { message: "Invalid or expired token" });
      return reply(200, toV2Contact(await mock.getMe(req.token)));
    }
    if (req.token !== adminToken) {
      return reply(401, { message: "The access token is invalid" });
    }

    if (req.version === "v2") {
      if (req.path === "/contacts") {
        const search = req.query.get("search_terms");
        const found =
          search === null
            ? await mock.listAllContacts()
            : await mock.searchContacts(search);
        return reply(200, page(found, req.query).map(toV2Contact));
      }
      if (parts[0] === "contacts" && parts.length === 2) {
        return reply(200, toV2Contact(await mock.getContact(parts[1])));
      }
      if (
        parts[0] === "contacts" &&
        parts[2] === "memberships" &&
        parts.length === 3
      ) {
        return reply(200, page(await mock.getMemberships(parts[1]), req.query));
      }
      if (parts[0] === "membership_levels" && parts.length === 2) {
        return reply(200, await mock.getMembershipLevel(parts[1]));
      }
      if (req.path === "/events") {
        const after = req.query.get("after");
        const before = req.query.get("before");
        const events = await mock.listEvents({
          after: after ? new Date(after) : undefined,
          before: before ? new Date(before) : undefined,
        });
        // The spec promises no order, so don't give the client a free one.
        return reply(200, page(events.reverse(), req.query).map(toV2Event));
      }
      if (parts[0] === "events" && parts.length === 2) {
        return reply(200, toV2Event(await mock.getEvent(parts[1])));
      }
    } else {
      if (
        parts[0] === "groups" &&
        parts[2] === "contacts" &&
        parts.length === 3
      ) {
        // Like v1: inactive contacts only with show_all=true.
        const everyone = await mock.listGroupContacts(parts[1]);
        const shown =
          req.query.get("show_all") === "true"
            ? everyone
            : everyone.filter((c) => c.status === "active");
        const members = page(shown, req.query);
        // The mock's group lists carry no field data, but v1's list has the
        // field definitions, so build each from the whole contact.
        const whole = await Promise.all(
          members.map((c) => mock.getContact(c.id)),
        );
        return reply(200, whole.map(toV1Contact));
      }
      if (
        parts[0] === "contacts" &&
        parts[2] === "groups" &&
        parts.length === 3
      ) {
        const groups = await mock.listContactGroups(parts[1]);
        return reply(200, page(groups, req.query).map(toV1Group));
      }
    }
    throw noRoute();
  }

  /** The three writes the app makes, as the specs describe them. */
  async function answerWrite(
    req: FakeRequest,
    parts: string[],
    noRoute: () => Error,
  ): Promise<Response> {
    if (req.token !== adminToken) {
      return reply(401, { message: "The access token is invalid" });
    }
    // v1: PUT /groups/{groupID}/contacts/{contactID} answers 204, no body.
    if (
      req.version === "v1" &&
      req.method === "PUT" &&
      parts[0] === "groups" &&
      parts[2] === "contacts" &&
      parts.length === 4
    ) {
      await mock.addContactToGroup(parts[1], parts[3]);
      return new Response(null, { status: 204 });
    }
    if (req.version === "v2" && parts[0] === "contacts") {
      // PATCH /contacts/{id}: a Contact body; answers the updated Contact.
      if (req.method === "PATCH" && parts.length === 2) {
        const fields = (req.body as { custom_fields?: unknown } | undefined)
          ?.custom_fields;
        const bad =
          fields === undefined
            ? undefined
            : typeof fields !== "object" || fields === null
              ? "custom_fields"
              : Object.entries(fields).find(
                  ([, answer]) =>
                    typeof answer !== "object" ||
                    answer === null ||
                    typeof (answer as { value?: unknown }).value !== "string",
                )?.[0];
        if (bad !== undefined) {
          return reply(422, { errors: { [bad]: "must be a Custom-Field" } });
        }
        const patch = (req.body ?? {}) as ContactPatch;
        return reply(
          200,
          toV2Contact(await mock.updateContact(parts[1], patch)),
        );
      }
      // POST /contacts/{id}/notes: { text }; answers the Note, 201.
      if (req.method === "POST" && parts[2] === "notes" && parts.length === 3) {
        const text = (req.body as { text?: unknown } | undefined)?.text;
        const note = await mock.addNote(
          parts[1],
          typeof text === "string" ? text : "",
        );
        return reply(201, note);
      }
    }
    throw noRoute();
  }

  const fakeFetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = new URL(
      typeof input === "string" || input instanceof URL ? input : input.url,
    );
    const match = /^\/(v1|v2)(\/.*)$/.exec(url.pathname);
    if (url.host !== "api.tidyhq.com" || !match) {
      throw new Error(
        `fake TidyHQ: unexpected host or path ${url.host}${url.pathname}`,
      );
    }
    const authorization = new Headers(init?.headers).get("authorization");
    const req: FakeRequest = {
      method: init?.method ?? "GET",
      version: match[1] as "v1" | "v2",
      path: match[2],
      query: url.searchParams,
      token: authorization?.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length)
        : null,
      url: url.toString(),
      body: parseBody(init?.body),
    };
    requests.push(req);

    for (const handler of handlers) {
      const response = handler(req);
      if (response) return response;
    }
    let answered: Response;
    try {
      answered = await answer(req);
    } catch (error) {
      if (!(error instanceof TidyError)) throw error;
      answered = reply(error.status, { message: error.message });
    }
    for (const handler of afterHandlers) {
      answered = handler(req, answered) ?? answered;
    }
    return answered;
  };

  return {
    fetch: fakeFetch as typeof fetch,
    requests,
    intercept: (handler) => handlers.push(handler),
    interceptAfter: (handler) => afterHandlers.push(handler),
  };
}

function parseBody(body: BodyInit | null | undefined): unknown {
  if (typeof body !== "string") return undefined;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

// --- Spec shapes -----------------------------------------------------------

/** v2 Contact: the fields the app reads, plus some it must ignore. */
function toV2Contact(c: Contact) {
  return {
    ...c,
    full_name: `${c.first_name} ${c.last_name}`.trim(),
    kind: "person",
    subscribed: true,
    user: null,
    organization: { id: "org_sml", name: "SML", domain_prefix: "sml" },
    contact_links: [],
  };
}

/** v2 Event, with fields we don't read. */
function toV2Event(e: Event) {
  // The attendance link is the app's, not a TidyHQ field: never on the wire.
  const { attendance_group_id, ...spec } = e;
  void attendance_group_id;
  return {
    ...spec,
    category_id: null,
    visible: "anyone",
    visible_to: [],
    public_url: `https://sml.tidyhq.com/public/events/${e.id}`,
  };
}

/** `2012-12-16T21:01:22.000Z` as v1 writes it: `2012-12-16 21:01:22 +0000`. */
function v1Time(iso: string): string {
  return (
    iso
      .replace("T", " ")
      .replace(/\.\d+Z$/, "")
      .replace(/Z$/, "") + " +0000"
  );
}

/**
 * v1 Contact: custom fields are a list of field definitions with no value,
 * and there are no notes.
 */
function toV1Contact(c: Contact) {
  return {
    id: c.id,
    first_name: c.first_name,
    last_name: c.last_name,
    nick_name: c.nick_name,
    display_name: c.display_name,
    email_address: c.email_address,
    status: c.status,
    member_since: c.member_since,
    created_at: v1Time(c.created_at),
    updated_at: v1Time(c.updated_at),
    custom_fields: Object.values(c.custom_fields).map((f) => ({
      id: f.id,
      title: f.title,
      type: f.type,
      created_at: v1Time(c.created_at),
    })),
    groups: [],
  };
}

/** v1 Group: `contacts_count`, and no `archived`, `size` or `updated_at`. */
function toV1Group(g: Group) {
  return {
    id: g.id,
    label: g.label,
    description: g.description,
    created_at: v1Time(g.created_at),
    contacts_count: g.size,
  };
}
