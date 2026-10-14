type OriginEnv = { APP_ORIGIN?: string; NODE_ENV?: string };

/**
 * `APP_ORIGIN` as an origin (e.g. `https://checkin.example.org`), or null
 * outside production when it's unset. Required in production, where the
 * request's own headers can't be trusted to name the site: a proxy may
 * rewrite Host or leave out the scheme. Throws if it is missing there, or
 * isn't a bare http(s) origin. In production it must be https, except for
 * localhost and 127.0.0.1 (local runs and end-to-end tests): cookies are
 * marked Secure from this scheme, so a plain-http site would be a mistake.
 */
export function configuredAppOrigin(
  env: OriginEnv = process.env,
): string | null {
  const value = env.APP_ORIGIN?.trim();
  if (!value) {
    if (env.NODE_ENV === "production") {
      throw new Error(
        "APP_ORIGIN must be set in production (e.g. https://checkin.example.org).",
      );
    }
    return null;
  }
  const url = URL.canParse(value) ? new URL(value) : null;
  if (
    !url ||
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      `APP_ORIGIN must be a bare origin like https://checkin.example.org, got "${value}"`,
    );
  }
  if (
    env.NODE_ENV === "production" &&
    url.protocol === "http:" &&
    url.hostname !== "localhost" &&
    url.hostname !== "127.0.0.1"
  ) {
    throw new Error(
      `APP_ORIGIN must use https in production (http is only allowed for localhost), got "${value}"`,
    );
  }
  return url.origin;
}

/**
 * This site's origin as the browser sees it. The single place that works it
 * out, so the sign-in redirect URI, the fake TidyHQ page's check, and the
 * sign-out CSRF check always agree. Uses `APP_ORIGIN` when set (always, in
 * production). In development it guesses from the request: the Host header,
 * and the first `x-forwarded-proto` if a proxy sent a list.
 */
export function appOrigin(
  headers: Headers,
  env: OriginEnv = process.env,
): string {
  const configured = configuredAppOrigin(env);
  if (configured) return configured;
  const host = headers.get("host");
  if (!host) throw new Error("Request has no Host header");
  const proto = headers.get("x-forwarded-proto")?.split(",")[0].trim();
  return `${proto === "https" ? "https" : "http"}://${host}`;
}

/**
 * Whether a state-changing request came from this site, not another one
 * (CSRF). Uses `Sec-Fetch-Site` where the browser sends it, and the `Origin`
 * header on older browsers. A request with neither wasn't sent cross-site by
 * a browser, so it is allowed.
 */
export function isSameSiteRequest(headers: Headers, origin: string): boolean {
  const site = headers.get("sec-fetch-site");
  if (site) return site === "same-origin" || site === "none";
  const requestOrigin = headers.get("origin");
  if (requestOrigin) return requestOrigin === origin;
  return true;
}
