import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieStore = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));

import { SESSION_COOKIE } from "@/lib/auth/session";
import { POST } from "./route";

function signOut(
  headers: Record<string, string>,
  form?: Record<string, string>,
) {
  return POST(
    new NextRequest("http://localhost:3000/auth/signout", {
      method: "POST",
      headers: { host: "localhost:3000", ...headers },
      body: form ? new URLSearchParams(form) : undefined,
    }),
  );
}

describe("POST /auth/signout", () => {
  beforeEach(() => {
    cookieStore.delete.mockReset();
  });

  it("signs out a same-origin request and redirects home with 303", async () => {
    const response = await signOut({ "sec-fetch-site": "same-origin" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3000/");
    expect(cookieStore.delete).toHaveBeenCalledWith(SESSION_COOKIE);
  });

  it("returns to a page on this site, e.g. to sign in as someone else", async () => {
    const response = await signOut(
      { "sec-fetch-site": "same-origin" },
      { returnTo: "/checkin/ev_tonight" },
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/checkin/ev_tonight",
    );
    expect(cookieStore.delete).toHaveBeenCalledWith(SESSION_COOKIE);
  });

  it("goes home instead of to another site", async () => {
    const response = await signOut(
      { "sec-fetch-site": "same-origin" },
      { returnTo: "//evil.example/" },
    );
    expect(response.headers.get("location")).toBe("http://localhost:3000/");
    expect(cookieStore.delete).toHaveBeenCalledWith(SESSION_COOKIE);
  });

  it("refuses a cross-site request without signing out", async () => {
    const response = await signOut({
      "sec-fetch-site": "cross-site",
      origin: "https://evil.example",
    });
    expect(response.status).toBe(403);
    expect(cookieStore.delete).not.toHaveBeenCalled();
  });

  it("refuses a request from another origin on older browsers", async () => {
    const response = await signOut({ origin: "https://evil.example" });
    expect(response.status).toBe(403);
    expect(cookieStore.delete).not.toHaveBeenCalled();
  });
});
