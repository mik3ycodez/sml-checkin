import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  path: "/checkin/ev_tonight?x=1" as string | null,
  session: {
    contactId: "c_dante",
    exp: 9e9,
    name: "Dante Ruiz",
    initials: "DR",
  } as Record<string, unknown> | null,
  sessionThrows: false,
  headersThrow: false,
}));

vi.mock("next/headers", () => ({
  headers: async () => {
    if (state.headersThrow) throw new Error("outside a request");
    return { get: (n: string) => (n === "x-sml-path" ? state.path : null) };
  },
}));
vi.mock("@/lib/auth/session", () => ({
  getSession: async () => {
    if (state.sessionThrows) throw new Error("SESSION_SECRET is not set");
    return state.session;
  },
}));

import { loadHeaderProfile } from "./headerProfile";

beforeEach(() => {
  state.path = "/checkin/ev_tonight?x=1";
  state.session = {
    contactId: "c_dante",
    exp: 9e9,
    name: "Dante Ruiz",
    initials: "DR",
  };
  state.sessionThrows = false;
  state.headersThrow = false;
});

describe("loadHeaderProfile", () => {
  it("gives the display fields only, never the contact id or expiry", async () => {
    const { profile } = await loadHeaderProfile();
    expect(profile).toEqual({ name: "Dante Ruiz", initials: "DR" });
  });

  it("returns to the page the request was for", async () => {
    expect((await loadHeaderProfile()).returnTo).toBe(
      "/checkin/ev_tonight?x=1",
    );
  });

  // The staff page is a mode for volunteers; the next member on a shared phone
  // should land on the member check-in page, not a staff sign-in.
  it("signs out from a staff check-in page to the member check-in page", async () => {
    state.path = "/admin/events/ev_tonight/checkin?q=da";
    expect((await loadHeaderProfile()).returnTo).toBe("/checkin/ev_tonight");
  });

  it("falls back to home for a missing or unsafe path", async () => {
    for (const path of [
      null,
      "",
      "//evil.com",
      "https://evil.com",
      "/a/../b",
    ]) {
      state.path = path;
      expect((await loadHeaderProfile()).returnTo).toBe("/");
    }
  });

  it("is signed out with no session", async () => {
    state.session = null;
    expect((await loadHeaderProfile()).profile).toBeNull();
  });

  it("renders signed out, not broken, when the session can't be read", async () => {
    state.sessionThrows = true;
    expect(await loadHeaderProfile()).toEqual({
      profile: null,
      returnTo: "/checkin/ev_tonight?x=1",
    });
  });

  it("falls back to home when headers can't be read", async () => {
    state.headersThrow = true;
    expect((await loadHeaderProfile()).returnTo).toBe("/");
  });

  it("never logs the error it swallowed", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    state.sessionThrows = true;
    await loadHeaderProfile();
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
