/**
 * This site's origin as the browser sees it, e.g. `https://checkin.example.org`.
 * The single place that works it out, so the sign-in redirect URI and the
 * fake TidyHQ page's check always agree. Behind a TLS proxy, the proxy's
 * `x-forwarded-proto` gives the scheme (the first one, if several proxies
 * added to the list).
 */
export function appOrigin(headers: Headers): string {
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
