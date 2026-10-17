import { TidyError } from "../errors";

/** Fixed hosts: no setting can point the admin token somewhere else. */
const HOSTS = {
  v1: "https://api.tidyhq.com/v1",
  v2: "https://api.tidyhq.com/v2",
} as const;

/** Per request, so our server answers before a member's phone gives up. */
export const REQUEST_TIMEOUT_MS = 8000;
export const PAGE_SIZE = 100;
/** Past this we throw rather than return a partial list. */
export const MAX_PAGES = 200;
const RETRY_PAUSE_MS = 300;
const MAX_MESSAGE_CHARS = 200;

export type TidyVersion = keyof typeof HOSTS;
export type TidyMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type Query = Record<string, string | number>;

type Common = {
  /** Injected so tests never touch the network. */
  fetch: typeof fetch;
  token: string;
  /** "admin" 401s are configuration problems; "member" 401s are not. */
  tokenKind: "admin" | "member";
  version: TidyVersion;
  /** Starts with "/" and holds ids only; query values go in `query`. */
  path: string;
  query?: Query;
  /** Pause before the one retry; injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
};

export type TidyRequestOptions = Common & {
  method: TidyMethod;
  body?: unknown;
  /** "none" accepts any 2xx body (a group add may return nothing). */
  expect: "record" | "list" | "none";
};

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function isTimeout(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

/** TidyHQ's `message`, cut short, with our own secrets taken out. */
function safeMessage(body: unknown, token: string): string {
  if (typeof body !== "object" || body === null) return "";
  const message = (body as { message?: unknown }).message;
  if (typeof message !== "string") return "";
  return message
    .split(token)
    .join("[token]")
    .replace(/bearer\s+\S+/gi, "[token]")
    .slice(0, MAX_MESSAGE_CHARS);
}

function hasId(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const id = (value as { id?: unknown }).id;
  return (typeof id === "string" && id !== "") || typeof id === "number";
}

type Attempt =
  | { ok: true; data: unknown }
  | { ok: false; error: TidyError; retryable: boolean };

/**
 * One TidyHQ call. Returns the parsed body, or throws a `TidyError`: TidyHQ's
 * own status for HTTP errors, 504 for a timeout, 502 for a network failure or
 * a body of the wrong shape. Reads that time out, fail on the network or get a
 * 502/503/504 are retried once; writes never are, since the first attempt may
 * have happened. Messages and logs carry the method, path (ids), status and
 * TidyHQ's message, and never tokens, bodies or query strings.
 */
export async function tidyRequest(
  options: TidyRequestOptions,
): Promise<unknown> {
  const { method, version, path } = options;
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("?")) {
    throw new TidyError(500, "TidyHQ request has an invalid path");
  }
  const label = `${method} /${version}${path}`;
  const sleep = options.sleep ?? defaultSleep;
  const mayRetry = method === "GET";

  let attempt = await tryOnce(options, label);
  if (!attempt.ok && attempt.retryable && mayRetry) {
    await sleep(RETRY_PAUSE_MS);
    attempt = await tryOnce(options, label);
  }
  if (attempt.ok) return attempt.data;

  const { error } = attempt;
  console.warn("tidyhq request failed", {
    request: label,
    status: error.status,
  });
  if (error.status === 401 && options.tokenKind === "admin") {
    console.error("tidyhq admin token rejected: check TIDYHQ_ADMIN_TOKEN", {
      request: label,
    });
  }
  throw error;
}

async function tryOnce(
  options: TidyRequestOptions,
  label: string,
): Promise<Attempt> {
  const { token, version, path, query, method, body, expect } = options;
  let url = HOSTS[version] + path;
  if (query && Object.keys(query).length > 0) {
    url += `?${new URLSearchParams(
      Object.entries(query).map(([k, v]) => [k, String(v)]),
    )}`;
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const fail = (
    status: number,
    detail: string,
    retryable = false,
  ): Attempt => ({
    ok: false,
    retryable,
    error: new TidyError(status, `TidyHQ ${label} failed (${status})${detail}`),
  });

  try {
    const res = await options.fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      let message = "";
      try {
        message = safeMessage(await res.json(), token);
      } catch {
        // an error page, not JSON: the status is enough
      }
      const retryable =
        res.status === 502 || res.status === 503 || res.status === 504;
      return fail(res.status, message ? `: ${message}` : "", retryable);
    }

    if (expect === "none") return { ok: true, data: undefined };

    let data: unknown;
    try {
      data = await res.json();
    } catch (e) {
      if (isTimeout(e)) return fail(504, ": timed out", true);
      return fail(502, ": response was not JSON");
    }
    if (expect === "list") {
      if (!Array.isArray(data) || !data.every(hasId)) {
        return fail(502, ": unexpected response shape");
      }
    } else if (!hasId(data)) {
      return fail(502, ": unexpected response shape");
    }
    return { ok: true, data };
  } catch (e) {
    // Never include the caught error's text: it can echo request headers.
    if (isTimeout(e)) return fail(504, ": timed out", true);
    return fail(502, ": network error", true);
  }
}

/**
 * Every item of a v2 list. Asks for `PAGE_SIZE` at a time and stops only at an
 * empty page: a short page can just mean TidyHQ caps page size below what we
 * asked for. The offset advances by what we received. Items are de-duplicated
 * by id, and more than `MAX_PAGES` pages throws rather than returning a part.
 */
export async function tidyRequestAll(options: Common): Promise<unknown[]> {
  const seen = new Set<string>();
  const items: unknown[] = [];
  let offset = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const batch = (await tidyRequest({
      ...options,
      method: "GET",
      expect: "list",
      query: { ...options.query, limit: PAGE_SIZE, offset },
    })) as Array<{ id: string | number }>;
    if (batch.length === 0) return items;
    for (const item of batch) {
      const key = String(item.id);
      if (!seen.has(key)) {
        seen.add(key);
        items.push(item);
      }
    }
    offset += batch.length;
  }
  throw new TidyError(
    502,
    `TidyHQ GET /${options.version}${options.path} has too many pages`,
  );
}
