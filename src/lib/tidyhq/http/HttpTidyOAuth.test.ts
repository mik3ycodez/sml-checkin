import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withBudget, MIN_ATTEMPT_MS, REQUEST_TIMEOUT_MS } from "../budget";
import { isTidyError } from "../errors";
import { HttpTidyOAuth } from "./HttpTidyOAuth";

// Recognizable on purpose: any appearance in a log or an error is a leak.
const CLIENT_SECRET = "cs_SECRET_live_5d1e77ab90";
const CODE = "code_ONE_TIME_a81c33f2";
const TOKEN = "member_TOKEN_e4409b6d1f";
const REDIRECT = "https://checkin.sml-test.invalid/auth/callback";

type Call = { url: string; init: RequestInit };

function fakeFetch(...script: Array<Response | Error>) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = script[Math.min(calls.length - 1, script.length - 1)];
    if (next instanceof Error) throw next;
    return next.clone();
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function oauth(f: typeof fetch) {
  return new HttpTidyOAuth({
    clientId: "client_id_1234",
    clientSecret: CLIENT_SECRET,
    domainPrefix: "sml",
    fetch: f,
  });
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

async function caught(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error("expected a rejection");
}

/** Everything a person reading logs or an error page could learn from it. */
function visibleIn(error: unknown): string {
  const e = error as Error & { cause?: unknown };
  return [
    e.message,
    e.stack ?? "",
    String(e.cause ?? ""),
    JSON.stringify(e, Object.getOwnPropertyNames(e)),
  ].join("\n");
}

describe("HttpTidyOAuth.authorizeUrl", () => {
  it("builds TidyHQ's authorize URL for the sml domain", () => {
    const url = new URL(
      oauth(fakeFetch().fetch).authorizeUrl({
        redirectUri: REDIRECT,
        state: "state_abc",
      }),
    );
    expect(url.origin + url.pathname).toBe(
      "https://accounts.tidyhq.com/oauth/authorize",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "client_id_1234",
      redirect_uri: REDIRECT,
      response_type: "code",
      state: "state_abc",
      domain_prefix: "sml",
    });
  });

  it("never puts the client secret in the URL a browser is sent to", () => {
    const url = oauth(fakeFetch().fetch).authorizeUrl({
      redirectUri: REDIRECT,
      state: "s",
    });
    expect(url).not.toContain(CLIENT_SECRET);
  });
});

describe("HttpTidyOAuth.exchangeCode", () => {
  it("posts the code and the secret to the token endpoint, server-side", async () => {
    const f = fakeFetch(json({ access_token: TOKEN, token_type: "Bearer" }));
    const token = await oauth(f.fetch).exchangeCode({
      code: CODE,
      redirectUri: REDIRECT,
    });
    expect(token).toBe(TOKEN);

    expect(f.calls).toHaveLength(1);
    const { url, init } = f.calls[0];
    expect(url).toBe("https://accounts.tidyhq.com/oauth/token");
    expect(init.method).toBe("POST");
    // In the body, not the URL.
    expect(url).not.toContain(CLIENT_SECRET);
    expect(url).not.toContain(CODE);
    const body = new URLSearchParams(String(init.body));
    expect(Object.fromEntries(body)).toEqual({
      grant_type: "authorization_code",
      client_id: "client_id_1234",
      client_secret: CLIENT_SECRET,
      code: CODE,
      redirect_uri: REDIRECT,
    });
    expect(init.redirect).toBe("error");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("logs nothing on success: not the code, the token or the secret", async () => {
    const f = fakeFetch(json({ access_token: TOKEN }));
    await oauth(f.fetch).exchangeCode({ code: CODE, redirectUri: REDIRECT });
    expect(logged.join("\n")).not.toMatch(
      new RegExp(`${CODE}|${TOKEN}|${CLIENT_SECRET}`),
    );
  });

  it.each([400, 401, 403])(
    "maps TidyHQ's refusal of the code (HTTP %i) to TidyError(401)",
    async (status) => {
      const f = fakeFetch(json({ error: "invalid_grant" }, status));
      const error = await caught(
        oauth(f.fetch).exchangeCode({ code: CODE, redirectUri: REDIRECT }),
      );
      expect(isTidyError(error, 401)).toBe(true);
    },
  );

  it("does not retry: a code works once", async () => {
    const f = fakeFetch(json({}, 503), json({ access_token: TOKEN }));
    await caught(
      oauth(f.fetch).exchangeCode({ code: CODE, redirectUri: REDIRECT }),
    );
    expect(f.calls).toHaveLength(1);
  });

  it("maps a server error to 502, a timeout to 504 and a dropped connection to 502", async () => {
    const cases: Array<[Response | Error, number]> = [
      [json({}, 500), 502],
      [json({}, 503), 502],
      [new DOMException("timed out", "TimeoutError"), 504],
      [new TypeError("fetch failed"), 502],
    ];
    for (const [answer, status] of cases) {
      const error = await caught(
        oauth(fakeFetch(answer).fetch).exchangeCode({
          code: CODE,
          redirectUri: REDIRECT,
        }),
      );
      expect(isTidyError(error, status), String(answer)).toBe(true);
    }
  });

  it.each([
    ["no token key", json({ token_type: "Bearer" })],
    ["a blank token", json({ access_token: "  " })],
    ["a token that isn't text", json({ access_token: 12 })],
    ["a body that isn't JSON", new Response("<html>hi</html>")],
  ])("treats %s in a 200 reply as a bad response (502)", async (_n, reply) => {
    const error = await caught(
      oauth(fakeFetch(reply).fetch).exchangeCode({
        code: CODE,
        redirectUri: REDIRECT,
      }),
    );
    expect(isTidyError(error, 502)).toBe(true);
  });

  it("says which settings to check when TidyHQ rejects the client itself", async () => {
    const f = fakeFetch(json({ error: "invalid_client" }, 401));
    const error = await caught(
      oauth(f.fetch).exchangeCode({ code: CODE, redirectUri: REDIRECT }),
    );
    expect(isTidyError(error, 401)).toBe(true);
    expect(logged.join("\n")).toMatch(/TIDYHQ_CLIENT_ID.*TIDYHQ_CLIENT_SECRET/);
  });

  it.each([
    "invalid_request",
    "invalid_client",
    "invalid_grant",
    "unauthorized_client",
    "unsupported_grant_type",
    "invalid_scope",
  ])(
    "logs TidyHQ's OAuth error name %s, so a config error shows",
    async (name) => {
      const f = fakeFetch(json({ error: name }, 400));
      await caught(
        oauth(f.fetch).exchangeCode({ code: CODE, redirectUri: REDIRECT }),
      );
      expect(logged.join("\n")).toContain(name);
    },
  );

  it("never logs an error value that isn't one of the fixed names (it could echo input)", async () => {
    const echo = `bad redirect ${REDIRECT} code=${CODE}`;
    const f = fakeFetch(json({ error: echo, error_description: echo }, 400));
    const error = await caught(
      oauth(f.fetch).exchangeCode({ code: CODE, redirectUri: REDIRECT }),
    );
    expect(isTidyError(error, 401)).toBe(true);
    expect(logged.join("\n")).not.toContain("bad redirect");
    expect(logged.join("\n")).not.toContain(CODE);
  });

  it("does not start the exchange without a full attempt's time: the code would be spent for nothing", async () => {
    vi.useFakeTimers();
    try {
      const f = fakeFetch(json({ access_token: TOKEN }));
      const error = await withBudget(REQUEST_TIMEOUT_MS - 1, () =>
        caught(
          oauth(f.fetch).exchangeCode({ code: CODE, redirectUri: REDIRECT }),
        ),
      );
      expect(isTidyError(error, 504)).toBe(true);
      expect(f.calls).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("refuses without calling TidyHQ when the budget is spent", async () => {
    vi.useFakeTimers();
    try {
      const f = fakeFetch(json({ access_token: TOKEN }));
      const error = await withBudget(MIN_ATTEMPT_MS, () =>
        caught(
          oauth(f.fetch).exchangeCode({ code: CODE, redirectUri: REDIRECT }),
        ),
      );
      expect(isTidyError(error, 504)).toBe(true);
      expect(f.calls).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the client secret never leaks", () => {
  // Every way the exchange can go wrong, with the server echoing the secret
  // (and the code and token) back wherever it can. PR 2's request layer can't
  // cover this: it never holds the secret.
  const echo = `bad request: client_secret=${CLIENT_SECRET} code=${CODE} ${TOKEN}`;
  const scenarios: Array<[string, () => Response | Error]> = [
    ["a 400 whose message echoes it", () => json({ error: echo }, 400)],
    [
      "a 401 whose description echoes it",
      () =>
        json(
          {
            error: "invalid_client",
            error_description: echo,
            client_secret: CLIENT_SECRET,
          },
          401,
        ),
    ],
    ["a 500 whose body echoes it", () => new Response(echo, { status: 500 })],
    ["a 503 with JSON that echoes it", () => json({ message: echo }, 503)],
    ["a 200 with no token that echoes it", () => json({ message: echo })],
    ["a 200 that is not JSON", () => new Response(echo)],
    [
      "a network error whose text echoes it",
      () => new TypeError(`connect failed for ${echo}`),
    ],
    [
      "a timeout whose text echoes it",
      () => new DOMException(echo, "TimeoutError"),
    ],
    [
      "an error carrying a cause that echoes it",
      () => new Error("outer", { cause: new Error(echo) }),
    ],
  ];

  it.each(scenarios)("%s", async (_name, answer) => {
    const f = fakeFetch(answer());
    const error = await caught(
      oauth(f.fetch).exchangeCode({ code: CODE, redirectUri: REDIRECT }),
    );
    const seen = `${visibleIn(error)}\n${logged.join("\n")}`;
    expect(seen).not.toContain(CLIENT_SECRET);
    expect(seen).not.toContain(CODE);
    expect(seen).not.toContain(TOKEN);
    expect(seen).not.toContain("client_secret=");
  });
});
