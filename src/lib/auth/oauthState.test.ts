import { describe, expect, it } from "vitest";
import {
  checkCallback,
  newOAuthState,
  OAUTH_STATE_COOKIE_PREFIX,
  oauthStateCookieName,
} from "./oauthState";

const STATE = "a".repeat(43);

describe("newOAuthState", () => {
  it("makes a long random state each time", () => {
    const a = newOAuthState("/checkin/ev_tonight");
    const b = newOAuthState("/checkin/ev_tonight");
    expect(a.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.state).not.toBe(b.state);
  });

  it("names its cookie after the state, so sign-ins in two tabs don't collide", () => {
    const saved = newOAuthState("/checkin/ev_tonight");
    expect(saved.cookieName).toBe(`${OAUTH_STATE_COOKIE_PREFIX}${saved.state}`);
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

describe("oauthStateCookieName", () => {
  it("names the cookie for a well-formed state", () => {
    expect(oauthStateCookieName(STATE)).toBe(
      `${OAUTH_STATE_COOKIE_PREFIX}${STATE}`,
    );
  });

  it.each([
    null,
    "",
    "short",
    "a".repeat(44),
    `${"a".repeat(42)}=`,
    `${"a".repeat(42)};`,
  ])("refuses malformed state %j", (state) => {
    expect(oauthStateCookieName(state)).toBe(null);
  });
});

describe("checkCallback", () => {
  const cookies: Record<string, string> = {
    [`${OAUTH_STATE_COOKIE_PREFIX}${STATE}`]: "/checkin/x",
  };
  const read = (name: string) => cookies[name];

  it("accepts a state with a saved cookie and returns the code and return path", () => {
    expect(checkCallback({ code: "c", state: STATE }, read)).toEqual({
      ok: true,
      code: "c",
      returnTo: "/checkin/x",
      cookieName: `${OAUTH_STATE_COOKIE_PREFIX}${STATE}`,
    });
  });

  it("keeps the return path when the code is missing", () => {
    expect(checkCallback({ code: null, state: STATE }, read)).toEqual({
      ok: false,
      returnTo: "/checkin/x",
    });
    expect(checkCallback({ code: "", state: STATE }, read)).toEqual({
      ok: false,
      returnTo: "/checkin/x",
    });
  });

  it.each([
    ["a state with no saved cookie", "b".repeat(43)],
    ["no state", null],
    ["a malformed state", "junk"],
  ])("rejects %s, returning to /", (_label, state) => {
    expect(checkCallback({ code: "c", state }, read)).toEqual({
      ok: false,
      returnTo: "/",
    });
  });

  it("re-checks the saved return path, in case the cookie was edited", () => {
    const edited = () => "//evil.com";
    expect(checkCallback({ code: "c", state: STATE }, edited)).toMatchObject({
      ok: true,
      returnTo: "/",
    });
  });
});
