import { TidyError } from "../errors";
import type { TidyOAuth } from "../oauth";
import { tidyTokenPost } from "./request";

const AUTHORIZE_URL = "https://accounts.tidyhq.com/oauth/authorize";

export interface HttpTidyOAuthOptions {
  clientId: string;
  /** Held only here and sent only in the token request's body. */
  clientSecret: string;
  /** `TIDYHQ_DOMAIN_PREFIX`: which TidyHQ organisation's sign-in to show. */
  domainPrefix: string;
  /** Tests inject a fake; otherwise the global `fetch`. */
  fetch?: typeof fetch;
}

/**
 * Member sign-in with the real TidyHQ. The authorize URL sends the browser to
 * TidyHQ; `exchangeCode` runs server-side, with the client secret, and
 * returns the member's token. The caller uses that token for one call
 * (`getMe`) and drops it: it is never stored in a cookie or session, and
 * nothing here logs the code, the token or the secret. Errors carry fixed
 * text only, never anything TidyHQ sent back, since it may echo them.
 *
 * LIVE-UNKNOWN(oauth-token-exchange): the request and reply formats are from
 * TidyHQ's OAuth documentation as we understand it (a form-encoded POST; JSON
 * back with `access_token`), and which statuses a bad or reused code gets.
 * Go-live checklist item 10 checks them against the real thing.
 */
export class HttpTidyOAuth implements TidyOAuth {
  constructor(private readonly options: HttpTidyOAuthOptions) {}

  authorizeUrl({ redirectUri, state }: { redirectUri: string; state: string }) {
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set("client_id", this.options.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);
    url.searchParams.set("domain_prefix", this.options.domainPrefix);
    return url.toString();
  }

  async exchangeCode({
    code,
    redirectUri,
  }: {
    code: string;
    redirectUri: string;
  }): Promise<string> {
    const { status, body } = await tidyTokenPost({
      fetch: this.options.fetch ?? ((...args) => globalThis.fetch(...args)),
      form: {
        grant_type: "authorization_code",
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
        code,
        redirect_uri: redirectUri,
      },
    });

    if (status >= 200 && status < 300) {
      const token =
        typeof body === "object" && body !== null
          ? (body as { access_token?: unknown }).access_token
          : undefined;
      if (typeof token === "string" && token.trim() !== "") return token;
      console.warn("tidyhq sign-in failed", { status, reason: "no token" });
      throw new TidyError(502, "TidyHQ sign-in failed (502): unexpected reply");
    }

    console.warn("tidyhq sign-in failed", { status });
    if (status === 400 || status === 401 || status === 403) {
      const error =
        typeof body === "object" && body !== null
          ? (body as { error?: unknown }).error
          : undefined;
      if (error === "invalid_client") {
        // Ours to fix, not the member's: say where to look.
        console.error(
          "tidyhq rejected the client: check TIDYHQ_CLIENT_ID and TIDYHQ_CLIENT_SECRET",
        );
      }
      throw new TidyError(401, "Invalid authorization code");
    }
    throw new TidyError(502, `TidyHQ sign-in failed (${status})`);
  }
}
