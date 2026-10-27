import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieStore = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));

import { THEME_COOKIE, THEME_MAX_AGE_SECONDS } from "@/lib/theme";
import { POST } from "./route";

function post(headers: Record<string, string>, form?: Record<string, string>) {
  return POST(
    new NextRequest("http://localhost:3000/theme", {
      method: "POST",
      headers: { host: "localhost:3000", ...headers },
      body: form ? new URLSearchParams(form) : undefined,
    }),
  );
}

const SAME_SITE = { "sec-fetch-site": "same-origin" };

describe("POST /theme", () => {
  beforeEach(() => {
    cookieStore.set.mockReset();
    cookieStore.delete.mockReset();
  });

  it.each(["system", "light", "dark"])(
    "saves %s for a year and redirects back with 303",
    async (theme) => {
      const response = await post(SAME_SITE, { theme, returnTo: "/me" });
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe("http://localhost:3000/me");
      expect(cookieStore.set).toHaveBeenCalledTimes(1);
      expect(cookieStore.set).toHaveBeenCalledWith(
        THEME_COOKIE,
        theme,
        expect.objectContaining({
          path: "/",
          maxAge: THEME_MAX_AGE_SECONDS,
          httpOnly: true,
          sameSite: "lax",
        }),
      );
    },
  );

  // The exact page, query included: nobody is changing members here, so unlike
  // Sign out there is no rule that sends a check-in screen back to the start.
  it.each([
    "/checkin/ev_tonight",
    "/checkin/ev_tonight/problem?reason=x",
    "/me",
    "/",
    "/admin/events/ev_tonight?x=1",
  ])("returns to exactly %s", async (returnTo) => {
    const response = await post(SAME_SITE, { theme: "dark", returnTo });
    expect(response.headers.get("location")).toBe(
      `http://localhost:3000${returnTo}`,
    );
  });

  it.each([
    "//evil.example/",
    "https://evil.example/",
    "/\\evil.example",
    "/a/../b",
    "",
  ])("goes home instead of to %j", async (returnTo) => {
    const response = await post(SAME_SITE, { theme: "dark", returnTo });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3000/");
  });

  it("goes home with no returnTo", async () => {
    const response = await post(SAME_SITE, { theme: "dark" });
    expect(response.headers.get("location")).toBe("http://localhost:3000/");
  });

  it.each<Record<string, string>>([
    { theme: "purple" },
    { theme: "" },
    { theme: "DARK" },
    { theme: "dark;path=/" },
    {},
  ])("ignores a bad value %j: no cookie, still goes back", async (form) => {
    const response = await post(SAME_SITE, { ...form, returnTo: "/me" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3000/me");
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("ignores a post with no form body", async () => {
    const response = await post(SAME_SITE);
    expect(response.status).toBe(303);
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("refuses a cross-site post without changing the theme", async () => {
    const response = await post(
      { "sec-fetch-site": "cross-site", origin: "https://evil.example" },
      { theme: "dark", returnTo: "/me" },
    );
    expect(response.status).toBe(403);
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("refuses a post from another origin on older browsers", async () => {
    const response = await post(
      { origin: "https://evil.example" },
      { theme: "dark" },
    );
    expect(response.status).toBe(403);
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("touches nothing but the theme cookie", async () => {
    await post(SAME_SITE, { theme: "dark", returnTo: "/me" });
    expect(cookieStore.delete).not.toHaveBeenCalled();
    expect(cookieStore.set.mock.calls.map((c) => c[0])).toEqual([THEME_COOKIE]);
  });
});
