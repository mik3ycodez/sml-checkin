import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookieStore = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));

// redirect() throws in Next.js; record where it was sent instead.
class Redirected extends Error {
  constructor(readonly url: string) {
    super(`redirect ${url}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirected(url);
  },
}));

import { OAUTH_STATE_COOKIE, serializeOAuthState } from "@/lib/auth/oauthState";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { getTidyOAuth } from "@/lib/tidyhq";
import { MockTidyOAuth } from "@/lib/tidyhq/mock/MockTidyOAuth";
import { GET } from "./route";

const ORIGIN = "http://localhost:3000";
const REDIRECT_URI = `${ORIGIN}/auth/callback`;
const SAVED = serializeOAuthState({ state: "abc123", returnTo: "/checkin/ev_tonight" });

async function callback(query: Record<string, string>): Promise<string> {
  const url = new URL(REDIRECT_URI);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const request = new NextRequest(url, { headers: { host: "localhost:3000" } });
  const error = await GET(request).catch((e: unknown) => e);
  if (!(error instanceof Redirected)) throw error;
  return error.url;
}

function issueCode(contactId: string, redirectUri = REDIRECT_URI): string {
  return (getTidyOAuth() as MockTidyOAuth).issueCode(contactId, redirectUri);
}

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.stubEnv("TIDYHQ_MODE", "mock");
    vi.stubEnv("SESSION_SECRET", "test-secret-that-is-at-least-32-characters-long");
    for (const fn of Object.values(cookieStore)) fn.mockReset();
    cookieStore.get.mockImplementation((name: string) =>
      name === OAUTH_STATE_COOKIE ? { value: SAVED } : undefined,
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete (globalThis as { __tidy?: unknown }).__tidy;
  });

  it("signs the member in and returns them to the saved page", async () => {
    const to = await callback({ code: issueCode("c_dante"), state: "abc123" });
    expect(to).toBe("/checkin/ev_tonight");
    expect(cookieStore.set).toHaveBeenCalledWith(
      SESSION_COOKIE,
      expect.any(String),
      expect.objectContaining({ httpOnly: true }),
    );
    expect(cookieStore.delete).toHaveBeenCalledWith({
      name: OAUTH_STATE_COOKIE,
      path: "/auth",
    });
  });

  it("leaves the saved state alone when the state doesn't match", async () => {
    // A stray or forged callback must not break a sign-in in progress.
    await callback({ code: issueCode("c_dante"), state: "junk" });
    expect(cookieStore.delete).not.toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("keeps the return page when the state doesn't match", async () => {
    const to = await callback({ code: issueCode("c_dante"), state: "junk" });
    expect(to).toBe("/auth/error?returnTo=%2Fcheckin%2Fev_tonight");
  });

  it("sends a bad code to the error page with the return page", async () => {
    const to = await callback({ code: "garbage", state: "abc123" });
    expect(to).toBe("/auth/error?returnTo=%2Fcheckin%2Fev_tonight");
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("refuses a code issued for a different redirect URI", async () => {
    const code = issueCode("c_dante", "http://192.168.1.5:3000/auth/callback");
    const to = await callback({ code, state: "abc123" });
    expect(to).toMatch(/^\/auth\/error/);
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("sends an unknown contact to the error page", async () => {
    const to = await callback({ code: issueCode("c_nobody"), state: "abc123" });
    expect(to).toMatch(/^\/auth\/error/);
    expect(cookieStore.set).not.toHaveBeenCalled();
  });
});
