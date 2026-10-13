import { TidyError } from "../errors";
import type { TidyOAuth } from "../oauth";
import { issueMockToken } from "./MockTidyClient";

const CODE_PREFIX = "mock-code-";
export const MOCK_AUTHORIZE_PATH = "/mock-tidyhq/oauth/authorize";
const CALLBACK_PATH = "/auth/callback";

/** Code the fake sign-in page hands back for a seed member. */
export function issueMockCode(contactId: string): string {
  return `${CODE_PREFIX}${contactId}`;
}

/**
 * Fake TidyHQ sign-in. Sends members to our own fake sign-in page (on the
 * same site as the callback) and swaps its codes for mock tokens.
 */
export class MockTidyOAuth implements TidyOAuth {
  constructor(private readonly clientId: string) {}

  authorizeUrl({ redirectUri, state }: { redirectUri: string; state: string }) {
    const url = new URL(MOCK_AUTHORIZE_PATH, redirectUri);
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);
    return url.toString();
  }

  async exchangeCode({ code }: { code: string; redirectUri: string }) {
    const contactId = code.startsWith(CODE_PREFIX)
      ? code.slice(CODE_PREFIX.length)
      : "";
    if (!contactId) throw new TidyError(401, "Invalid authorization code");
    return issueMockToken(contactId);
  }
}

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The fake sign-in page's query, or null if it is malformed. Like real
 * TidyHQ, which only redirects to an app's registered URI, the redirect must
 * be our own callback, so the page can't send members to another site.
 */
export function parseMockAuthorizeRequest(
  params: SearchParams,
  appOrigin: string,
): { redirectUri: string; state: string } | null {
  const { redirect_uri, state, response_type } = params;
  if (typeof redirect_uri !== "string" || typeof state !== "string") {
    return null;
  }
  if (!state || response_type !== "code") return null;
  if (!URL.canParse(redirect_uri)) return null;
  const url = new URL(redirect_uri);
  if (url.origin !== appOrigin || url.pathname !== CALLBACK_PATH) return null;
  return { redirectUri: redirect_uri, state };
}
