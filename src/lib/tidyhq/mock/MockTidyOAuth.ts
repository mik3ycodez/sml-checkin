import { randomBytes } from "node:crypto";
import { TidyError } from "../errors";
import type { TidyOAuth } from "../oauth";
import { issueMockToken } from "./MockTidyClient";

export const MOCK_AUTHORIZE_PATH = "/mock-tidyhq/oauth/authorize";
const CALLBACK_PATH = "/auth/callback";
const CODE_LIFETIME_MS = 10 * 60 * 1000;

type IssuedCode = { contactId: string; redirectUri: string; issuedAt: number };

/**
 * Fake TidyHQ sign-in. Sends members to our own fake sign-in page (on the
 * same site as the callback) and swaps its codes for mock tokens. Codes
 * behave like real OAuth ones: random, single-use, short-lived, and tied to
 * the redirect URI they were issued for.
 */
export class MockTidyOAuth implements TidyOAuth {
  private readonly codes = new Map<string, IssuedCode>();

  constructor(
    readonly clientId: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  authorizeUrl({ redirectUri, state }: { redirectUri: string; state: string }) {
    const url = new URL(MOCK_AUTHORIZE_PATH, redirectUri);
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);
    return url.toString();
  }

  /** Called by the fake sign-in page when a member is picked. */
  issueCode(contactId: string, redirectUri: string): string {
    const issuedAt = this.now().getTime();
    for (const [code, issued] of this.codes) {
      if (this.isExpired(issued, issuedAt)) this.codes.delete(code);
    }
    const code = `mock-code-${randomBytes(16).toString("base64url")}`;
    this.codes.set(code, { contactId, redirectUri, issuedAt });
    return code;
  }

  /** Forgets every issued code. Mock only: for the end-to-end tests' reset. */
  reset(): void {
    this.codes.clear();
  }

  async exchangeCode({
    code,
    redirectUri,
  }: {
    code: string;
    redirectUri: string;
  }) {
    const issued = this.codes.get(code);
    this.codes.delete(code);
    if (
      !issued ||
      issued.redirectUri !== redirectUri ||
      this.isExpired(issued, this.now().getTime())
    ) {
      throw new TidyError(401, "Invalid authorization code");
    }
    return issueMockToken(issued.contactId);
  }

  private isExpired(issued: IssuedCode, nowMs: number): boolean {
    return nowMs - issued.issuedAt > CODE_LIFETIME_MS;
  }
}

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The fake sign-in page's query, or null if it is malformed. Like real
 * TidyHQ, which only redirects to an app's registered URI, the request must
 * carry our client id and redirect to our own callback, so the page can't
 * send members to another site.
 */
export function parseMockAuthorizeRequest(
  params: SearchParams,
  appOrigin: string,
  clientId: string,
): { redirectUri: string; state: string } | null {
  const { client_id, redirect_uri, state, response_type } = params;
  if (typeof redirect_uri !== "string" || typeof state !== "string") {
    return null;
  }
  if (!state || response_type !== "code" || client_id !== clientId) return null;
  if (!URL.canParse(redirect_uri)) return null;
  const url = new URL(redirect_uri);
  if (url.origin !== appOrigin || url.pathname !== CALLBACK_PATH) return null;
  return { redirectUri: redirect_uri, state };
}
