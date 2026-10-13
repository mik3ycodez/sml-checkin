import { describe, expect, it } from "vitest";
import { appOrigin, isSameSiteRequest } from "./requestOrigin";

describe("appOrigin", () => {
  it("uses the Host header over plain http by default", () => {
    expect(appOrigin(new Headers({ host: "localhost:3000" }))).toBe(
      "http://localhost:3000",
    );
  });

  it("uses the scheme a proxy reports", () => {
    const headers = new Headers({
      host: "checkin.example.org",
      "x-forwarded-proto": "https",
    });
    expect(appOrigin(headers)).toBe("https://checkin.example.org");
  });

  it("takes the first scheme when proxies send a list", () => {
    const headers = new Headers({
      host: "checkin.example.org",
      "x-forwarded-proto": "https, http",
    });
    expect(appOrigin(headers)).toBe("https://checkin.example.org");
  });

  it("ignores a scheme that isn't http or https", () => {
    const headers = new Headers({
      host: "localhost:3000",
      "x-forwarded-proto": "javascript",
    });
    expect(appOrigin(headers)).toBe("http://localhost:3000");
  });

  it("throws without a Host header", () => {
    expect(() => appOrigin(new Headers())).toThrow(/Host/);
  });
});

describe("isSameSiteRequest", () => {
  const ORIGIN = "https://checkin.example.org";

  it.each(["same-origin", "none"])("allows Sec-Fetch-Site %s", (site) => {
    const headers = new Headers({ "sec-fetch-site": site });
    expect(isSameSiteRequest(headers, ORIGIN)).toBe(true);
  });

  it.each(["cross-site", "same-site"])("refuses Sec-Fetch-Site %s", (site) => {
    // same-site also refused: another app on a sibling subdomain is not us.
    const headers = new Headers({ "sec-fetch-site": site, origin: ORIGIN });
    expect(isSameSiteRequest(headers, ORIGIN)).toBe(false);
  });

  it("falls back to the Origin header on browsers without Sec-Fetch-Site", () => {
    expect(isSameSiteRequest(new Headers({ origin: ORIGIN }), ORIGIN)).toBe(true);
    expect(
      isSameSiteRequest(new Headers({ origin: "https://evil.example" }), ORIGIN),
    ).toBe(false);
  });

  it("allows a request with neither header (not sent cross-site by a browser)", () => {
    expect(isSameSiteRequest(new Headers(), ORIGIN)).toBe(true);
  });
});
