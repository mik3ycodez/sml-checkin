import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookieStore = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));

// React's cache() only memoizes inside a server request, so record the
// functions it wraps instead.
const cached = vi.hoisted(() => new Set<unknown>());
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T>(fn: T): T => {
    cached.add(fn);
    return fn;
  },
}));

import {
  clearSession,
  getSession,
  getSessionSecret,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  setSession,
  signSession,
  verifySession,
} from "./session";

const SECRET = "test-secret-that-is-at-least-32-characters-long";
const OTHER_SECRET = "another-secret-that-is-at-least-32-characters";
const NOW = new Date("2026-10-13T18:00:00Z");
const NOW_SECONDS = NOW.getTime() / 1000;

function secondsLater(seconds: number): Date {
  return new Date(NOW.getTime() + seconds * 1000);
}

describe("signSession / verifySession", () => {
  it("round-trips the contact id", () => {
    const token = signSession("c_dante", SECRET, NOW);
    expect(verifySession(token, SECRET, NOW)).toEqual({
      contactId: "c_dante",
      exp: NOW_SECONDS + SESSION_MAX_AGE_SECONDS,
    });
  });

  it("lasts 90 days", () => {
    expect(SESSION_MAX_AGE_SECONDS).toBe(90 * 24 * 60 * 60);
  });

  it("holds only the contact id and expiry", () => {
    const [payload] = signSession("c_dante", SECRET, NOW).split(".");
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString());
    expect(Object.keys(decoded).sort()).toEqual(["contactId", "exp"]);
  });

  it("round-trips the display-only profile fields", () => {
    const profile = {
      name: "Dante Ruiz",
      initials: "DR",
      photo: "https://img.example.org/d.jpg",
    };
    const token = signSession("c_dante", SECRET, NOW, profile);
    expect(verifySession(token, SECRET, NOW)).toEqual({
      contactId: "c_dante",
      exp: NOW_SECONDS + SESSION_MAX_AGE_SECONDS,
      ...profile,
    });
  });

  it("never signs a photo that is not https, or a long one", () => {
    for (const photo of [
      "http://img.example.org/d.jpg",
      `https://img.example.org/${"a".repeat(600)}`,
    ]) {
      const token = signSession("c_dante", SECRET, NOW, { photo });
      expect(verifySession(token, SECRET, NOW)?.photo).toBeUndefined();
    }
  });

  it("keeps a signed cookie small however long the name is", () => {
    const token = signSession("c_dante", SECRET, NOW, {
      name: "n".repeat(5000),
      photo: `https://img.example.org/${"a".repeat(5000)}`,
    });
    expect(token.length).toBeLessThan(1000);
  });

  it("still verifies an old cookie with no profile fields", () => {
    const body = Buffer.from(
      JSON.stringify({ contactId: "c_dante", exp: NOW_SECONDS + 1000 }),
    ).toString("base64url");
    const sig = createHmac("sha256", SECRET).update(body).digest("base64url");
    expect(verifySession(`${body}.${sig}`, SECRET, NOW)).toEqual({
      contactId: "c_dante",
      exp: NOW_SECONDS + 1000,
    });
  });

  it("re-checks the profile fields on the way out, even if the signature is good", () => {
    const body = Buffer.from(
      JSON.stringify({
        contactId: "c_dante",
        exp: NOW_SECONDS + 1000,
        photo: "javascript:alert(1)",
        name: 5,
      }),
    ).toString("base64url");
    const sig = createHmac("sha256", SECRET).update(body).digest("base64url");
    expect(verifySession(`${body}.${sig}`, SECRET, NOW)).toEqual({
      contactId: "c_dante",
      exp: NOW_SECONDS + 1000,
    });
  });

  it("is still valid one second before expiry", () => {
    const token = signSession("c_dante", SECRET, NOW);
    const justBefore = secondsLater(SESSION_MAX_AGE_SECONDS - 1);
    expect(verifySession(token, SECRET, justBefore)).not.toBeNull();
  });

  it("rejects an expired session", () => {
    const token = signSession("c_dante", SECRET, NOW);
    const atExpiry = secondsLater(SESSION_MAX_AGE_SECONDS);
    expect(verifySession(token, SECRET, atExpiry)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const token = signSession("c_dante", SECRET, NOW);
    const last = token.at(-1) === "A" ? "B" : "A";
    expect(verifySession(token.slice(0, -1) + last, SECRET, NOW)).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const [, signature] = signSession("c_dante", SECRET, NOW).split(".");
    const forged = Buffer.from(
      JSON.stringify({ contactId: "c_marcus", exp: NOW_SECONDS + 1000 }),
    ).toString("base64url");
    expect(verifySession(`${forged}.${signature}`, SECRET, NOW)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const token = signSession("c_dante", OTHER_SECRET, NOW);
    expect(verifySession(token, SECRET, NOW)).toBeNull();
  });

  it.each([
    ["undefined", undefined],
    ["empty", ""],
    ["no dot", "abc"],
    ["too many parts", "a.b.c"],
    ["empty signature", "abc."],
    ["garbage", "!!!.???"],
  ])("rejects bad input (%s)", (_label, token) => {
    expect(verifySession(token, SECRET, NOW)).toBeNull();
  });

  // Signs an arbitrary payload, to check its shape is validated even when the
  // signature is good.
  function signedPayload(payload: unknown): string {
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig = createHmac("sha256", SECRET).update(body).digest("base64url");
    return `${body}.${sig}`;
  }

  it.each([
    ["not JSON", "not json"],
    ["missing contactId", { exp: NOW_SECONDS + 1000 }],
    ["empty contactId", { contactId: "", exp: NOW_SECONDS + 1000 }],
    ["numeric contactId", { contactId: 42, exp: NOW_SECONDS + 1000 }],
    ["missing exp", { contactId: "c_dante" }],
    ["string exp", { contactId: "c_dante", exp: "9999999999" }],
    ["null", null],
  ])("rejects a correctly signed but malformed payload (%s)", (_l, payload) => {
    expect(verifySession(signedPayload(payload), SECRET, NOW)).toBeNull();
  });

  it("refuses to sign an empty contact id", () => {
    expect(() => signSession("", SECRET, NOW)).toThrow(/contact id/);
  });
});

describe("getSessionSecret", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns SESSION_SECRET", () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    expect(getSessionSecret()).toBe(SECRET);
  });

  it("throws a clear error when it is missing", () => {
    vi.stubEnv("SESSION_SECRET", "");
    expect(() => getSessionSecret()).toThrow(/SESSION_SECRET is not set/);
  });

  it("throws when it is too short to be safe", () => {
    vi.stubEnv("SESSION_SECRET", "short");
    expect(() => getSessionSecret()).toThrow(/at least 32 characters/);
  });
});

describe("cookie wrappers", () => {
  beforeEach(() => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    vi.useFakeTimers({ now: NOW });
    cookieStore.get.mockReset();
    cookieStore.set.mockReset();
    cookieStore.delete.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("setSession signs the profile into the cookie", async () => {
    const profile = { name: "Dante Ruiz", initials: "DR" };
    await setSession("c_dante", profile);
    expect(cookieStore.set.mock.calls[0][1]).toBe(
      signSession("c_dante", SECRET, NOW, profile),
    );
  });

  it("setSession writes a signed, httpOnly, lax cookie that lasts 90 days", async () => {
    await setSession("c_dante");
    expect(cookieStore.set).toHaveBeenCalledWith(
      SESSION_COOKIE,
      signSession("c_dante", SECRET, NOW),
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_MAX_AGE_SECONDS,
      }),
    );
  });

  it("marks the cookie secure when APP_ORIGIN is https", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ORIGIN", "https://checkin.example.org");
    await setSession("c_dante");
    expect(cookieStore.set.mock.calls[0][2]).toMatchObject({ secure: true });
  });

  it("does not mark the cookie secure in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("APP_ORIGIN", "");
    await setSession("c_dante");
    expect(cookieStore.set.mock.calls[0][2]).toMatchObject({ secure: false });
  });

  it("getSession returns the session from a valid cookie", async () => {
    cookieStore.get.mockReturnValue({
      name: SESSION_COOKIE,
      value: signSession("c_dante", SECRET, NOW),
    });
    expect(await getSession()).toMatchObject({ contactId: "c_dante" });
    expect(cookieStore.get).toHaveBeenCalledWith(SESSION_COOKIE);
  });

  it("getSession is wrapped in React cache(), so it runs once per request", () => {
    expect(cached).toContain(getSession);
  });

  it("getSession returns null with no cookie", async () => {
    cookieStore.get.mockReturnValue(undefined);
    expect(await getSession()).toBeNull();
  });

  it("getSession returns null for a forged cookie", async () => {
    cookieStore.get.mockReturnValue({
      name: SESSION_COOKIE,
      value: signSession("c_dante", OTHER_SECRET, NOW),
    });
    expect(await getSession()).toBeNull();
  });

  it("clearSession deletes the cookie", async () => {
    await clearSession();
    expect(cookieStore.delete).toHaveBeenCalledWith(SESSION_COOKIE);
  });
});
