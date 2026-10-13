import { describe, expect, it } from "vitest";
import { TidyError } from "../errors";
import { MockTidyClient } from "./MockTidyClient";
import {
  issueMockCode,
  MockTidyOAuth,
  parseMockAuthorizeRequest,
} from "./MockTidyOAuth";
import { createSeed } from "./seed";

const ORIGIN = "http://localhost:3000";
const REDIRECT_URI = `${ORIGIN}/auth/callback`;

async function expectTidyError(promise: Promise<unknown>, status: number) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(TidyError);
  expect((error as TidyError).status).toBe(status);
}

describe("MockTidyOAuth", () => {
  const oauth = new MockTidyOAuth("test-client-id");

  describe("authorizeUrl", () => {
    it("points at the fake sign-in page with the standard OAuth params", () => {
      const url = new URL(
        oauth.authorizeUrl({ redirectUri: REDIRECT_URI, state: "abc123" }),
      );
      expect(url.origin).toBe(ORIGIN);
      expect(url.pathname).toBe("/mock-tidyhq/oauth/authorize");
      expect(url.searchParams.get("client_id")).toBe("test-client-id");
      expect(url.searchParams.get("redirect_uri")).toBe(REDIRECT_URI);
      expect(url.searchParams.get("response_type")).toBe("code");
      expect(url.searchParams.get("state")).toBe("abc123");
    });
  });

  describe("exchangeCode", () => {
    it("returns a token that getMe resolves to the signed-in contact", async () => {
      const client = new MockTidyClient(createSeed());
      const token = await oauth.exchangeCode({
        code: issueMockCode("c_dante"),
        redirectUri: REDIRECT_URI,
      });
      const me = await client.getMe(token);
      expect(me.id).toBe("c_dante");
    });

    it.each(["", "garbage", "mock-code-", "mock-token-c_dante"])(
      "rejects code %j with 401",
      async (code) => {
        await expectTidyError(
          oauth.exchangeCode({ code, redirectUri: REDIRECT_URI }),
          401,
        );
      },
    );

    it("gives a token for an unknown contact that getMe then rejects", async () => {
      const client = new MockTidyClient(createSeed());
      const token = await oauth.exchangeCode({
        code: issueMockCode("c_nobody"),
        redirectUri: REDIRECT_URI,
      });
      await expectTidyError(client.getMe(token), 401);
    });
  });
});

describe("parseMockAuthorizeRequest", () => {
  const valid = {
    client_id: "test-client-id",
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    state: "abc123",
  };

  it("accepts a request that sends the member back to our callback", () => {
    expect(parseMockAuthorizeRequest(valid, ORIGIN)).toEqual({
      redirectUri: REDIRECT_URI,
      state: "abc123",
    });
  });

  it.each([
    ["another site", { redirect_uri: "https://evil.example/auth/callback" }],
    ["another path", { redirect_uri: `${ORIGIN}/somewhere-else` }],
    ["a relative redirect", { redirect_uri: "/auth/callback" }],
    ["no redirect", { redirect_uri: undefined }],
    ["no state", { state: undefined }],
    ["an empty state", { state: "" }],
    ["a repeated state", { state: ["a", "b"] }],
    ["the wrong response type", { response_type: "token" }],
  ])("rejects %s", (_label, override) => {
    expect(parseMockAuthorizeRequest({ ...valid, ...override }, ORIGIN)).toBe(
      null,
    );
  });
});
