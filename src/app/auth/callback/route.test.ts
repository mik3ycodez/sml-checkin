import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => new Map<string, string>());
const cookieStore = vi.hoisted(() => ({
  get: vi.fn((name: string) =>
    jar.has(name) ? { name, value: jar.get(name)! } : undefined,
  ),
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

import { newOAuthState, type OAuthState } from "@/lib/auth/oauthState";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { getTidyServices } from "@/lib/tidyhq";
import { GET } from "./route";

const ORIGIN = "http://localhost:3000";
const REDIRECT_URI = `${ORIGIN}/auth/callback`;

/** Starts a sign-in the way /auth/signin does: saves its cookie in the jar. */
function startSignIn(returnTo = "/checkin/ev_tonight"): OAuthState {
  const saved = newOAuthState(returnTo);
  jar.set(saved.cookieName, saved.returnTo);
  return saved;
}

async function callback(query: Record<string, string>): Promise<string> {
  const url = new URL(REDIRECT_URI);
  for (const [key, value] of Object.entries(query))
    url.searchParams.set(key, value);
  const request = new NextRequest(url, { headers: { host: "localhost:3000" } });
  const error = await GET(request).catch((e: unknown) => e);
  if (!(error instanceof Redirected)) throw error;
  return error.url;
}

function mockOAuth() {
  const tidy = getTidyServices();
  if (tidy.mode !== "mock") throw new Error("expected mock mode");
  return tidy.oauth;
}

function issueCode(contactId: string, redirectUri = REDIRECT_URI): string {
  return mockOAuth().issueCode(contactId, redirectUri);
}

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.stubEnv("TIDYHQ_MODE", "mock");
    vi.stubEnv(
      "SESSION_SECRET",
      "test-secret-that-is-at-least-32-characters-long",
    );
    jar.clear();
    cookieStore.set.mockClear();
    cookieStore.delete.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    delete (globalThis as { __tidy?: unknown }).__tidy;
  });

  it("signs the member in, returns them to the saved page, and uses up the attempt", async () => {
    const saved = startSignIn();
    const to = await callback({
      code: issueCode("c_dante"),
      state: saved.state,
    });
    expect(to).toBe("/checkin/ev_tonight");
    expect(cookieStore.set).toHaveBeenCalledWith(
      SESSION_COOKIE,
      expect.any(String),
      expect.objectContaining({ httpOnly: true }),
    );
    expect(cookieStore.delete).toHaveBeenCalledWith({
      name: saved.cookieName,
      path: "/auth",
    });
  });

  it("lets sign-ins started in two tabs both finish", async () => {
    const first = startSignIn("/checkin/ev_tonight");
    const second = startSignIn("/status");
    expect(
      await callback({ code: issueCode("c_dante"), state: first.state }),
    ).toBe("/checkin/ev_tonight");
    expect(
      await callback({ code: issueCode("c_dante"), state: second.state }),
    ).toBe("/status");
  });

  it("leaves saved sign-ins alone when the state is unknown", async () => {
    startSignIn();
    const to = await callback({
      code: issueCode("c_dante"),
      state: "b".repeat(43),
    });
    expect(to).toBe("/auth/error?returnTo=%2F");
    expect(cookieStore.delete).not.toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("sends a bad code to the error page with the return page", async () => {
    const saved = startSignIn();
    const to = await callback({ code: "garbage", state: saved.state });
    expect(to).toBe("/auth/error?returnTo=%2Fcheckin%2Fev_tonight");
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("shows the error page, not a crash, for a TidyError from another copy of the class", async () => {
    // Next.js bundles routes and pages separately, so the cached OAuth may
    // throw a TidyError that isn't `instanceof` this bundle's class.
    class OtherCopyTidyError extends Error {
      readonly status = 401;
      name = "TidyError";
    }
    vi.spyOn(mockOAuth(), "exchangeCode").mockRejectedValue(
      new OtherCopyTidyError("bad code"),
    );
    const saved = startSignIn();
    const to = await callback({ code: "anything", state: saved.state });
    expect(to).toBe("/auth/error?returnTo=%2Fcheckin%2Fev_tonight");
  });

  it("refuses a code issued for a different redirect URI", async () => {
    const saved = startSignIn();
    const code = issueCode("c_dante", "http://192.168.1.5:3000/auth/callback");
    const to = await callback({ code, state: saved.state });
    expect(to).toMatch(/^\/auth\/error/);
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("sends an unknown contact to the error page", async () => {
    const saved = startSignIn();
    const to = await callback({
      code: issueCode("c_nobody"),
      state: saved.state,
    });
    expect(to).toMatch(/^\/auth\/error/);
    expect(cookieStore.set).not.toHaveBeenCalled();
  });
});
