import {
  MIN_ATTEMPT_MS,
  REQUEST_TIMEOUT_MS,
  remainingMs,
  requestTimeoutMs,
} from "../budget";
import { TidyError } from "../errors";

/** Fixed hosts: no setting can point the admin token somewhere else. */
const HOSTS = {
  v1: "https://api.tidyhq.com/v1",
  v2: "https://api.tidyhq.com/v2",
} as const;

export { REQUEST_TIMEOUT_MS };
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
  /** "none" accepts any 2xx body (a group add may return nothing). */
  expect: "record" | "list" | "none";
} & (
    | { method: "GET"; body?: never }
    | { method: Exclude<TidyMethod, "GET">; body?: unknown }
  );

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function isTimeout(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

/** Every string in a request body, so an echo of it can be taken out. */
function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
  else if (typeof value === "object" && value !== null) {
    Object.values(value).forEach((v) => collectStrings(v, out));
  }
  return out;
}

/**
 * TidyHQ's `message`, cut short, with the token and anything we sent (query
 * and body text, such as a member's name) taken out in case it is echoed.
 */
function safeMessage(body: unknown, options: TidyRequestOptions): string {
  if (typeof body !== "object" || body === null) return "";
  const message = (body as { message?: unknown }).message;
  if (typeof message !== "string") return "";
  const sent = [
    ...Object.values(options.query ?? {}).filter((v) => typeof v === "string"),
    ...collectStrings(options.body),
  ].filter((v): v is string => v.length >= 3);
  let out = message.split(options.token).join("[token]");
  for (const value of sent) out = out.split(value).join("[removed]");
  return out.replace(/bearer\s+\S+/gi, "[token]").slice(0, MAX_MESSAGE_CHARS);
}

/** Frees the connection for a body we won't read. */
function discard(res: Response) {
  try {
    void res.body?.cancel().catch(() => {});
  } catch {
    // already consumed or locked: nothing to free
  }
}

/** One path segment: an id or a resource name, nothing that moves the path. */
const SEGMENT = /^[A-Za-z0-9_-]+$/;

function hasId(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const id = (value as { id?: unknown }).id;
  return (typeof id === "string" && id !== "") || typeof id === "number";
}

/** A retry that can't finish inside the time budget would only eat what's left. */
function timeForRetry(): boolean {
  const left = remainingMs();
  return left === null || left > RETRY_PAUSE_MS + MIN_ATTEMPT_MS;
}

type Attempt =
  | { ok: true; data: unknown }
  | { ok: false; error: TidyError; retryable: boolean };

/**
 * One TidyHQ call. Returns the parsed body, or throws a `TidyError`: TidyHQ's
 * own status for HTTP errors, 504 for a timeout, 502 for a network failure or
 * a body of the wrong shape. Reads that time out, fail on the network or get a
 * 502/503/504 are retried once, if the time budget allows (`withBudget`);
 * writes never are, since the first attempt may have happened. Messages and logs carry the method, path (ids), status and
 * TidyHQ's message, and never tokens, bodies or query strings.
 */
export async function tidyRequest(
  options: TidyRequestOptions,
): Promise<unknown> {
  const { method, version, path } = options;
  // Ids come from forms and URLs; refuse anything that could re-aim an
  // admin-token request ("..", "%2F", "#", "?", backslashes, blanks).
  if (
    !path.startsWith("/") ||
    !path
      .slice(1)
      .split("/")
      .every((part) => SEGMENT.test(part))
  ) {
    throw new TidyError(500, "TidyHQ request has an invalid path");
  }
  if (options.token.trim() === "") {
    throw new TidyError(401, `TidyHQ ${method} /${version}${path}: no token`);
  }
  const label = `${method} /${version}${path}`;
  const sleep = options.sleep ?? defaultSleep;
  const mayRetry = method === "GET";

  let attempt = await tryOnce(options, label);
  if (!attempt.ok && attempt.retryable && mayRetry && timeForRetry()) {
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

  // Inside a time budget, no request outlives it, and no write is cut short.
  const timeoutMs = requestTimeoutMs(REQUEST_TIMEOUT_MS, {
    write: method !== "GET",
  });
  if (timeoutMs === null) return fail(504, ": out of time");

  try {
    const res = await options.fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      let message = "";
      try {
        message = safeMessage(await res.json(), options);
      } catch {
        // an error page, not JSON: the status is enough
        discard(res);
      }
      const retryable =
        res.status === 502 || res.status === 503 || res.status === 504;
      return fail(res.status, message ? `: ${message}` : "", retryable);
    }

    if (expect === "none") {
      discard(res);
      return { ok: true, data: undefined };
    }

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
    let added = 0;
    for (const item of batch) {
      const key = String(item.id);
      if (!seen.has(key)) {
        seen.add(key);
        items.push(item);
        added++;
      }
    }
    if (added === 0) {
      // Only repeats: the server is ignoring `offset`. Stop now, not at the cap.
      throw tooMany(options, "keeps repeating the same items");
    }
    offset += batch.length;
  }
  throw tooMany(options, "has too many pages");
}

function tooMany(options: Common, why: string): TidyError {
  const request = `GET /${options.version}${options.path}`;
  console.error("tidyhq list has too many pages", { request, why });
  return new TidyError(502, `TidyHQ ${request} ${why}`);
}

const ACCOUNTS_TOKEN_URL = "https://accounts.tidyhq.com/oauth/token";

/**
 * The one POST to TidyHQ's accounts server: swapping a sign-in code for the
 * member's token. A form body, no Bearer header (the secret is in the form),
 * and never retried: a code works once. Returns the status and the parsed JSON
 * body (undefined if it wasn't JSON) for the caller to judge.
 *
 * Throws `TidyError` 504 for a timeout or spent budget and 502 for a network
 * failure. Those messages are fixed text: the form holds the client secret and
 * the code, and a caught error or a reply may echo them, so neither is ever
 * put in a message or a log here.
 */
export async function tidyTokenPost(options: {
  fetch: typeof fetch;
  form: Record<string, string>;
}): Promise<{ status: number; body: unknown }> {
  // A POST: given its full time or not sent, so a code isn't spent on an
  // exchange we then abandon.
  const timeoutMs = requestTimeoutMs(REQUEST_TIMEOUT_MS, { write: true });
  if (timeoutMs === null) {
    throw new TidyError(504, "TidyHQ sign-in failed (504): out of time");
  }
  let res: Response;
  try {
    res = await options.fetch(ACCOUNTS_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams(options.form).toString(),
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    if (isTimeout(e)) {
      throw new TidyError(504, "TidyHQ sign-in failed (504): timed out");
    }
    throw new TidyError(502, "TidyHQ sign-in failed (502): network error");
  }
  try {
    return { status: res.status, body: await res.json() };
  } catch (e) {
    if (isTimeout(e)) {
      throw new TidyError(504, "TidyHQ sign-in failed (504): timed out");
    }
    discard(res);
    return { status: res.status, body: undefined };
  }
}
