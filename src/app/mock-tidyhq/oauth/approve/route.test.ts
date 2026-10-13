import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTidyServices } from "@/lib/tidyhq";
import { POST } from "./route";

const ORIGIN = "http://localhost:3000";
const REDIRECT_URI = `${ORIGIN}/auth/callback`;

function approve(fields: Record<string, string>) {
  return POST(
    new NextRequest(`${ORIGIN}/mock-tidyhq/oauth/approve`, {
      method: "POST",
      headers: { host: "localhost:3000" },
      body: new URLSearchParams(fields),
    }),
  );
}

const VALID = {
  contact_id: "c_dante",
  client_id: "mock-client-id",
  redirect_uri: REDIRECT_URI,
  response_type: "code",
  state: "abc123",
};

describe("POST /mock-tidyhq/oauth/approve", () => {
  beforeEach(() => {
    vi.stubEnv("TIDYHQ_MODE", "mock");
    vi.stubEnv("TIDYHQ_CLIENT_ID", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete (globalThis as { __tidy?: unknown }).__tidy;
  });

  it("issues one code for the picked member and redirects to the callback", async () => {
    const response = await approve(VALID);
    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location")!);
    expect(`${location.origin}${location.pathname}`).toBe(REDIRECT_URI);
    expect(location.searchParams.get("state")).toBe("abc123");

    const tidy = getTidyServices();
    const token = await tidy.oauth.exchangeCode({
      code: location.searchParams.get("code")!,
      redirectUri: REDIRECT_URI,
    });
    expect((await tidy.client.getMe(token)).id).toBe("c_dante");
  });

  it("refuses a member who isn't in the mock", async () => {
    const response = await approve({ ...VALID, contact_id: "c_nobody" });
    expect(response.status).toBe(400);
  });

  it("refuses a redirect to another site", async () => {
    const response = await approve({
      ...VALID,
      redirect_uri: "https://evil.example/auth/callback",
    });
    expect(response.status).toBe(400);
  });

  it("404s outside mock mode, without building the live services", async () => {
    vi.stubEnv("TIDYHQ_MODE", "live");
    const response = await approve(VALID);
    expect(response.status).toBe(404);
  });
});
