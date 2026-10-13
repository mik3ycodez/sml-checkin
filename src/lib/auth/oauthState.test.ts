import { describe, expect, it } from "vitest";
import {
  checkCallback,
  newOAuthState,
  parseOAuthState,
  serializeOAuthState,
} from "./oauthState";

describe("newOAuthState", () => {
  it("makes a long random state each time", () => {
    const a = newOAuthState("/checkin/ev_tonight");
    const b = newOAuthState("/checkin/ev_tonight");
    expect(a.state).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(a.state).not.toBe(b.state);
  });

  it("keeps a safe return path", () => {
    expect(newOAuthState("/checkin/ev_tonight").returnTo).toBe(
      "/checkin/ev_tonight",
    );
  });

  it.each([null, "//evil.com", "https://evil.com"])(
    "replaces unsafe return path %j with /",
    (returnTo) => {
      expect(newOAuthState(returnTo).returnTo).toBe("/");
    },
  );
});

describe("parseOAuthState", () => {
  it("round-trips through serializeOAuthState", () => {
    const saved = newOAuthState("/checkin/ev_tonight");
    expect(parseOAuthState(serializeOAuthState(saved))).toEqual(saved);
  });

  it.each([undefined, "", "not json", "{}", '{"state":""}', '{"state":5}', "[]"])(
    "returns null for %j",
    (value) => {
      expect(parseOAuthState(value)).toBe(null);
    },
  );

  it("re-checks the return path, in case the cookie was edited", () => {
    const value = JSON.stringify({ state: "abc", returnTo: "//evil.com" });
    expect(parseOAuthState(value)).toEqual({ state: "abc", returnTo: "/" });
  });
});

describe("checkCallback", () => {
  const saved = serializeOAuthState({ state: "abc123", returnTo: "/checkin/x" });

  it("accepts a matching state and returns the code and return path", () => {
    expect(checkCallback({ code: "mock-code-c_dante", state: "abc123" }, saved))
      .toEqual({ ok: true, code: "mock-code-c_dante", returnTo: "/checkin/x" });
  });

  it.each([
    ["a different state", { code: "c", state: "other" }],
    ["no state", { code: "c", state: null }],
    ["no code", { code: null, state: "abc123" }],
    ["an empty code", { code: "", state: "abc123" }],
  ])("rejects %s, keeping the saved return path", (_label, params) => {
    expect(checkCallback(params, saved)).toEqual({
      ok: false,
      returnTo: "/checkin/x",
    });
  });

  it("rejects a callback with no saved state cookie, returning to /", () => {
    expect(checkCallback({ code: "c", state: "abc123" }, undefined)).toEqual({
      ok: false,
      returnTo: "/",
    });
  });
});
