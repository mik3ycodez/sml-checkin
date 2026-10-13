/**
 * Member sign-in with TidyHQ (OAuth authorization code flow). Kept apart from
 * `TidyClient` because the code exchange happens on TidyHQ's accounts server,
 * not its API. Get the app-wide instance with `getTidyOAuth()` from `.`.
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
