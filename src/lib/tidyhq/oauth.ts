import { parseTidyMode, type TidyMode } from ".";
import { MockTidyOAuth } from "./mock/MockTidyOAuth";

/**
 * Member sign-in with TidyHQ (OAuth authorization code flow). Kept apart from
 * `TidyClient` because the code exchange happens on TidyHQ's accounts server,
 * not its API.
 */
export interface TidyOAuth {
  /** Where to send the member to sign in. TidyHQ redirects back to `redirectUri`. */
  authorizeUrl(params: { redirectUri: string; state: string }): string;

  /**
   * Swaps the code from the callback for the member's access token. Throws
   * `TidyError` (401) for a bad code. `redirectUri` must match the one sent to
   * `authorizeUrl`, as OAuth requires.
   */
  exchangeCode(params: { code: string; redirectUri: string }): Promise<string>;
}

export function createTidyOAuth(mode: TidyMode): TidyOAuth {
  if (mode === "live") {
    throw new Error("TIDYHQ_MODE=live is not implemented yet (live OAuth)");
  }
  return new MockTidyOAuth(process.env.TIDYHQ_CLIENT_ID || "mock-client-id");
}

/** The app-wide TidyHQ OAuth, chosen by `TIDYHQ_MODE` (default `mock`). */
export function getTidyOAuth(): TidyOAuth {
  return createTidyOAuth(parseTidyMode(process.env.TIDYHQ_MODE));
}
