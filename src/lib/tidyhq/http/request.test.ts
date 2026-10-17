import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isTidyError } from "../errors";
import {
  MAX_PAGES,
  PAGE_SIZE,
  REQUEST_TIMEOUT_MS,
  tidyRequest,
  tidyRequestAll,
} from "./request";

const TOKEN = "tok_SECRET_admin_8f3a1c";
const CLIENT_SECRET = "cs_SECRET_client_77d2e9";

type Call = { url: string; init: RequestInit };

/** A fake fetch that answers from a script and records every call. */
function fakeFetch(
  ...script: Array<Response | Error | (() => Response | Error)>
) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = script[Math.min(calls.length - 1, script.length - 1)];
    const out = typeof next === "function" ? next() : next;
    if (out instanceof Error) throw out;
    return typeof out.clone === "function" ? out.clone() : out;
  });
  return { fetch: fn as unknown as typeof fetch, calls, fn };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const timeoutError = () => new DOMException("timed out", "TimeoutError");
const noSleep = async () => {};

function base(f: typeof fetch) {
  return {
    fetch: f,
    token: TOKEN,
    tokenKind: "admin" as const,
    sleep: noSleep,
  };
}

let logged: string[];
beforeEach(() => {
  logged = [];
  for (const m of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
      logged.push(
        args
          .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
          .join(" "),
      );
    });
  }
});
afterEach(() => vi.restoreAllMocks());

async function catchError(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error("expected a rejection");
}

describe("tidyRequest: request shape", () => {
  it("sends a Bearer header to the fixed v2 host, never the token in the URL", async () => {
    const f = fakeFetch(json({ id: "1" }));
    await tidyRequest({
      ...base(f.fetch),
      version: "v2",
      method: "GET",
      path: "/contacts/1",
      expect: "record",
    });
    expect(f.calls[0].url).toBe("https://api.tidyhq.com/v2/contacts/1");
    const headers = new Headers(f.calls[0].init.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
    expect(f.calls[0].url).not.toContain(TOKEN);
    expect(f.calls[0].init.method).toBe("GET");
  });

  it("uses the v1 host for v1 paths", async () => {
    const f = fakeFetch(json([]));
    await tidyRequest({
      ...base(f.fetch),
      version: "v1",
      method: "GET",
      path: "/contacts/1/groups",
      expect: "list",
    });
    expect(f.calls[0].url).toBe("https://api.tidyhq.com/v1/contacts/1/groups");
  });

  it("encodes query values and gives every request a timeout signal", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const f = fakeFetch(json([]));
    await tidyRequest({
      ...base(f.fetch),
      version: "v2",
      method: "GET",
      path: "/contacts",
      query: { search_terms: "Ann & Bo", limit: 5 },
      expect: "list",
    });
    expect(f.calls[0].url).toBe(
      "https://api.tidyhq.com/v2/contacts?search_terms=Ann+%26+Bo&limit=5",
    );
    expect(timeout).toHaveBeenCalledWith(REQUEST_TIMEOUT_MS);
    expect(REQUEST_TIMEOUT_MS).toBe(8000);
    expect(f.calls[0].init.signal).toBeInstanceOf(AbortSignal);
  });

  it("sends a JSON body on writes", async () => {
    const f = fakeFetch(json({ id: "1" }));
    await tidyRequest({
      ...base(f.fetch),
      version: "v2",
      method: "PATCH",
      path: "/contacts/1",
      body: { custom_fields: { a: 1 } },
      expect: "record",
    });
    expect(f.calls[0].init.body).toBe(
      JSON.stringify({ custom_fields: { a: 1 } }),
    );
    expect(new Headers(f.calls[0].init.headers).get("content-type")).toBe(
      "application/json",
    );
  });

  it("refuses redirects, so the token can't follow one elsewhere", async () => {
    const f = fakeFetch(json([]));
    await tidyRequest({
      ...base(f.fetch),
      version: "v2",
      method: "GET",
      path: "/events",
      expect: "list",
    });
    expect(f.calls[0].init.redirect).toBe("error");
  });

  it("rejects a path that isn't an absolute path on the fixed host", async () => {
    const f = fakeFetch(json([]));
    const err = await catchError(
      tidyRequest({
        ...base(f.fetch),
        version: "v2",
        method: "GET",
        path: "//evil.example/x",
        expect: "list",
      }),
    );
    expect(isTidyError(err)).toBe(true);
    expect(f.calls).toHaveLength(0);
  });
});

describe("tidyRequest: results", () => {
  it("returns a record and a list", async () => {
    const f = fakeFetch(
      json({ id: 7, name: "x" }),
      json([{ id: 1 }, { id: 2 }]),
    );
    const rec = await tidyRequest({
      ...base(f.fetch),
      version: "v2",
      method: "GET",
      path: "/a",
      expect: "record",
    });
    expect(rec).toEqual({ id: 7, name: "x" });
    const list = await tidyRequest({
      ...base(f.fetch),
      version: "v2",
      method: "GET",
      path: "/b",
      expect: "list",
    });
    expect(list).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("accepts any 2xx body when no body is expected", async () => {
    const f = fakeFetch(new Response(null, { status: 204 }));
    await expect(
      tidyRequest({
        ...base(f.fetch),
        version: "v1",
        method: "PUT",
        path: "/groups/1/contacts/2",
        expect: "none",
      }),
    ).resolves.toBeUndefined();
  });
});

describe("tidyRequest: error mapping", () => {
  it.each([401, 403, 404, 422, 429, 500, 501])(
    "passes %i through as a TidyError with that status",
    async (status) => {
      const f = fakeFetch(json({ message: "nope" }, status));
      const err = await catchError(
        tidyRequest({
          ...base(f.fetch),
          version: "v2",
          method: "POST",
          path: "/contacts/9/notes",
          expect: "record",
        }),
      );
      expect(isTidyError(err, status)).toBe(true);
      expect((err as Error).message).toContain("POST /v2/contacts/9/notes");
      expect((err as Error).message).toContain("nope");
    },
  );

  it("cuts TidyHQ's message to 200 characters", async () => {
    const f = fakeFetch(json({ message: "m".repeat(500) }, 422));
    const err = (await catchError(
      tidyRequest({
        ...base(f.fetch),
        version: "v2",
        method: "PATCH",
        path: "/contacts/1",
        expect: "record",
      }),
    )) as Error;
    expect(err.message).toContain("m".repeat(200));
    expect(err.message).not.toContain("m".repeat(201));
  });

  it("still maps an error status whose body isn't JSON", async () => {
    const f = fakeFetch(
      new Response("<html>Bad gateway</html>", { status: 500 }),
    );
    const err = await catchError(
      tidyRequest({
        ...base(f.fetch),
        version: "v2",
        method: "POST",
        path: "/x/1",
        expect: "record",
      }),
    );
    expect(isTidyError(err, 500)).toBe(true);
    expect((err as Error).message).not.toContain("<html>");
  });

  it("maps a timeout to 504", async () => {
    const f = fakeFetch(timeoutError());
    const err = await catchError(
      tidyRequest({
        ...base(f.fetch),
        version: "v2",
        method: "POST",
        path: "/x/1",
        expect: "record",
      }),
    );
    expect(isTidyError(err, 504)).toBe(true);
  });

  it("maps a network error to 502", async () => {
    const f = fakeFetch(new TypeError("fetch failed"));
    const err = await catchError(
      tidyRequest({
        ...base(f.fetch),
        version: "v2",
        method: "POST",
        path: "/x/1",
        expect: "record",
      }),
    );
    expect(isTidyError(err, 502)).toBe(true);
  });

  it.each([
    ["non-JSON body", () => new Response("<html>", { status: 200 }), "record"],
    ["object where a list is expected", () => json({ id: 1 }), "list"],
    ["array where a record is expected", () => json([{ id: 1 }]), "record"],
    ["record with no id", () => json({ name: "x" }), "record"],
    ["list item with no id", () => json([{ id: 1 }, { name: "x" }]), "list"],
    ["null body", () => json(null), "record"],
    ["list of non-objects", () => json([1, 2]), "list"],
  ] as const)("maps a 2xx %s to 502", async (_name, make, kind) => {
    const f = fakeFetch(make);
    const err = await catchError(
      tidyRequest({
        ...base(f.fetch),
        version: "v2",
        method: "POST",
        path: "/x/1",
        expect: kind,
      }),
    );
    expect(isTidyError(err, 502)).toBe(true);
  });

  it("maps a timeout while reading the body to 504", async () => {
    const res = {
      ok: true,
      status: 200,
      json: async () => {
        throw timeoutError();
      },
    } as unknown as Response;
    const f = fakeFetch(() => res);
    const err = await catchError(
      tidyRequest({
        ...base(f.fetch),
        version: "v2",
        method: "POST",
        path: "/x/1",
        expect: "record",
      }),
    );
    expect(isTidyError(err, 504)).toBe(true);
  });

  it("logs a rejected admin token as a configuration problem", async () => {
    const f = fakeFetch(json({ message: "invalid_token" }, 401));
    await catchError(
      tidyRequest({
        ...base(f.fetch),
        version: "v2",
        method: "GET",
        path: "/events",
        expect: "list",
      }),
    );
    expect(logged.join("\n")).toContain("admin token rejected");
  });

  it("does not call a member's rejected token a configuration problem", async () => {
    const f = fakeFetch(json({ message: "invalid_token" }, 401));
    await catchError(
      tidyRequest({
        ...base(f.fetch),
        tokenKind: "member",
        version: "v2",
        method: "GET",
        path: "/contacts/me",
        expect: "record",
      }),
    );
    expect(logged.join("\n")).not.toContain("admin token rejected");
  });
});

describe("tidyRequest: retries", () => {
  it.each([
    ["a timeout", () => timeoutError()],
    ["a network error", () => new TypeError("fetch failed")],
    ["a 502", () => json({}, 502)],
    ["a 503", () => json({}, 503)],
    ["a 504", () => json({}, 504)],
  ])("retries a read once after %s, and succeeds", async (_n, fail) => {
    const f = fakeFetch(fail, json({ id: 1 }));
    const sleep = vi.fn(noSleep);
    const out = await tidyRequest({
      ...base(f.fetch),
      sleep,
      version: "v2",
      method: "GET",
      path: "/contacts/1",
      expect: "record",
    });
    expect(out).toEqual({ id: 1 });
    expect(f.calls).toHaveLength(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("gives up after the one retry and reports the second failure", async () => {
    const f = fakeFetch(json({}, 503), json({}, 503), json({ id: 1 }));
    const err = await catchError(
      tidyRequest({
        ...base(f.fetch),
        version: "v2",
        method: "GET",
        path: "/contacts/1",
        expect: "record",
      }),
    );
    expect(isTidyError(err, 503)).toBe(true);
    expect(f.calls).toHaveLength(2);
  });

  it.each([401, 403, 404, 422, 429, 500])(
    "does not retry a read after %i",
    async (status) => {
      const f = fakeFetch(json({}, status), json({ id: 1 }));
      await catchError(
        tidyRequest({
          ...base(f.fetch),
          version: "v2",
          method: "GET",
          path: "/contacts/1",
          expect: "record",
        }),
      );
      expect(f.calls).toHaveLength(1);
    },
  );

  it("does not retry a read whose body is bad", async () => {
    const f = fakeFetch(
      new Response("<html>", { status: 200 }),
      json({ id: 1 }),
    );
    await catchError(
      tidyRequest({
        ...base(f.fetch),
        version: "v2",
        method: "GET",
        path: "/contacts/1",
        expect: "record",
      }),
    );
    expect(f.calls).toHaveLength(1);
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"] as const)(
    "never retries a %s, whatever goes wrong",
    async (method) => {
      for (const fail of [
        () => timeoutError(),
        () => new TypeError("fetch failed"),
        () => json({}, 502),
        () => json({}, 503),
        () => json({}, 504),
      ]) {
        const f = fakeFetch(fail, json({ id: 1 }));
        await catchError(
          tidyRequest({
            ...base(f.fetch),
            version: "v2",
            method,
            path: "/contacts/1",
            expect: "none",
          }),
        );
        expect(f.calls).toHaveLength(1);
      }
    },
  );
});

describe("tidyRequestAll: paging", () => {
  /** A fetch that serves `items` honoring limit/offset, at most `cap` per page. */
  function server(items: Array<{ id: number }>, cap = PAGE_SIZE) {
    const calls: Call[] = [];
    const fn = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      const u = new URL(String(url));
      const limit = Number(u.searchParams.get("limit"));
      const offset = Number(u.searchParams.get("offset"));
      return json(items.slice(offset, offset + Math.min(limit, cap)));
    }) as unknown as typeof fetch;
    return { fetch: fn, calls };
  }
  const ids = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: i + 1 }));
  const all = (f: typeof fetch, query?: Record<string, string | number>) =>
    tidyRequestAll({ ...base(f), version: "v2", path: "/contacts", query });

  it("asks for 100 per page", () => {
    expect(PAGE_SIZE).toBe(100);
  });

  it("returns an empty list after one request for an empty first page", async () => {
    const s = server([]);
    expect(await all(s.fetch)).toEqual([]);
    expect(s.calls).toHaveLength(1);
  });

  it("follows several pages and stops on the empty page, not a short one", async () => {
    const s = server(ids(250));
    const out = await all(s.fetch);
    expect(out).toHaveLength(250);
    // pages of 100, 100, 50, then the empty page that proves it's over
    expect(s.calls).toHaveLength(4);
    const offsets = s.calls.map((c) =>
      new URL(c.url).searchParams.get("offset"),
    );
    expect(offsets).toEqual(["0", "100", "200", "250"]);
  });

  it("makes the extra request even when the last page is exactly full", async () => {
    const s = server(ids(200));
    expect(await all(s.fetch)).toHaveLength(200);
    expect(s.calls).toHaveLength(3);
  });

  it("returns everything when the server caps pages below what we ask for", async () => {
    const s = server(ids(25), 10);
    const out = await all(s.fetch);
    expect(out.map((x) => (x as { id: number }).id)).toEqual(
      ids(25).map((x) => x.id),
    );
    const offsets = s.calls.map((c) =>
      new URL(c.url).searchParams.get("offset"),
    );
    expect(offsets).toEqual(["0", "10", "20", "25"]);
  });

  it("keeps the caller's query on every page", async () => {
    const s = server(ids(3), 2);
    await all(s.fetch, { after: "2026-01-01" });
    for (const c of s.calls) {
      expect(new URL(c.url).searchParams.get("after")).toBe("2026-01-01");
    }
  });

  it("de-duplicates by id when pages overlap", async () => {
    const pages = [
      json([{ id: 1 }, { id: 2 }]),
      json([{ id: 2 }, { id: 3 }]),
      json([]),
    ];
    const f = fakeFetch(...pages);
    const out = await all(f.fetch);
    expect(out.map((x) => (x as { id: number }).id)).toEqual([1, 2, 3]);
  });

  it("treats numeric and string ids as the same record", async () => {
    const f = fakeFetch(json([{ id: 1 }]), json([{ id: "1" }]), json([]));
    expect(await all(f.fetch)).toHaveLength(1);
  });

  it("throws at the page cap instead of returning a partial list", async () => {
    // a server that ignores offset and always returns fresh ids
    let n = 0;
    const f = fakeFetch(() => json([{ id: ++n }]));
    const err = await catchError(all(f.fetch));
    expect(isTidyError(err, 502)).toBe(true);
    expect(f.calls).toHaveLength(MAX_PAGES);
    expect(MAX_PAGES).toBe(200);
  });

  it("throws, not loops forever, when the server ignores offset", async () => {
    const f = fakeFetch(json([{ id: 1 }, { id: 2 }]));
    const err = await catchError(all(f.fetch));
    expect(isTidyError(err, 502)).toBe(true);
    expect(f.calls.length).toBeLessThanOrEqual(MAX_PAGES);
  });

  it("fails the whole read if any page fails, never a partial list", async () => {
    const f = fakeFetch(json(ids(100)), json({ message: "slow down" }, 429));
    const err = await catchError(all(f.fetch));
    expect(isTidyError(err, 429)).toBe(true);
  });

  it("retries a page read once, like any read", async () => {
    const f = fakeFetch(timeoutError(), json([{ id: 1 }]), json([]));
    expect(await all(f.fetch)).toEqual([{ id: 1 }]);
    expect(f.calls).toHaveLength(3);
  });
});

describe("secrets never leak", () => {
  const failures: Array<[string, Array<Response | Error>]> = [
    ["401", [json({ message: "invalid_token" }, 401)]],
    ["404", [json({ message: "not found" }, 404)]],
    ["429", [json({ message: "slow down" }, 429)]],
    ["500", [json({ message: "boom" }, 500)]],
    ["timeout", [timeoutError(), timeoutError()]],
    [
      "network failure",
      [new TypeError("fetch failed"), new TypeError("fetch failed")],
    ],
    ["bad body", [new Response("<html>", { status: 200 })]],
    // a misbehaving server that echoes what it was sent
    [
      "server echoing the token",
      [json({ message: `bad header Bearer ${TOKEN}` }, 401)],
    ],
    [
      "error that carries the token",
      [
        new TypeError(`fetch failed: Authorization: Bearer ${TOKEN}`),
        new TypeError("x"),
      ],
    ],
  ];

  it.each(failures)(
    "%s: no token or secret in the error or the logs",
    async (_n, script) => {
      const f = fakeFetch(...script);
      for (const [method, expectKind] of [
        ["GET", "record"],
        ["PATCH", "record"],
      ] as const) {
        const err = await catchError(
          tidyRequest({
            ...base(f.fetch),
            method,
            version: "v2",
            path: "/contacts/5",
            query: { search_terms: "Secret Member" },
            body: { note: "a request body" },
            expect: expectKind,
          }),
        );
        const text = `${(err as Error).name} ${(err as Error).message} ${(err as Error).stack ?? ""} ${JSON.stringify(err, Object.getOwnPropertyNames(err))}`;
        expect(text).not.toContain(TOKEN);
        expect(text).not.toContain(CLIENT_SECRET);
        expect(text).not.toContain("Secret Member");
        expect(text).not.toContain("Secret+Member");
        expect(text).not.toContain("a request body");
      }
      const out = logged.join("\n");
      expect(out).not.toContain(TOKEN);
      expect(out).not.toContain(CLIENT_SECRET);
      expect(out).not.toContain("Secret Member");
      expect(out).not.toContain("Secret+Member");
      expect(out).not.toContain("a request body");
      expect(out.toLowerCase()).not.toContain("bearer");
    },
  );

  it("paging errors don't leak either", async () => {
    const f = fakeFetch(json({ message: `echo ${TOKEN}` }, 401));
    const err = (await catchError(
      tidyRequestAll({
        ...base(f.fetch),
        version: "v2",
        path: "/contacts",
        query: { search_terms: "Secret Member" },
      }),
    )) as Error;
    expect(err.message).not.toContain(TOKEN);
    expect(err.message).not.toContain("Secret");
    expect(logged.join("\n")).not.toContain(TOKEN);
  });

  it("logs the method, path and status", async () => {
    const f = fakeFetch(json({ message: "gone" }, 404));
    await catchError(
      tidyRequest({
        ...base(f.fetch),
        version: "v2",
        method: "GET",
        path: "/events/42",
        expect: "record",
      }),
    );
    const out = logged.join("\n");
    expect(out).toContain("GET");
    expect(out).toContain("/v2/events/42");
    expect(out).toContain("404");
  });
});
