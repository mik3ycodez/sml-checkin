import { describe, expect, it } from "vitest";
import { appOrigin, configuredAppOrigin, isSameSiteRequest } from "./requestOrigin";

const DEV = { NODE_ENV: "development" };
const PROD = { NODE_ENV: "production", APP_ORIGIN: "https://checkin.example.org" };

describe("configuredAppOrigin", () => {
  it("returns APP_ORIGIN as an origin", () => {
    expect(configuredAppOrigin(PROD)).toBe("https://checkin.example.org");
  });

  it("drops a trailing slash", () => {
    expect(
      configuredAppOrigin({ ...PROD, APP_ORIGIN: "https://checkin.example.org/" }),
    ).toBe("https://checkin.example.org");
  });

  it("is null when unset outside production (guess from the request)", () => {
    expect(configuredAppOrigin(DEV)).toBe(null);
    expect(configuredAppOrigin({ NODE_ENV: "test", APP_ORIGIN: " " })).toBe(null);
  });

  it("is required in production", () => {
    expect(() => configuredAppOrigin({ NODE_ENV: "production" })).toThrow(
      /APP_ORIGIN must be set in production/,
    );
  });

  it.each([
    "checkin.example.org",
    "ftp://checkin.example.org",
    "https://checkin.example.org/checkin",
    "https://checkin.example.org?x=1",
  ])("rejects %j", (value) => {
    expect(() => configuredAppOrigin({ ...DEV, APP_ORIGIN: value })).toThrow(
      /APP_ORIGIN/,
    );
  });
});

describe("appOrigin", () => {
  it("uses APP_ORIGIN when set, whatever the request headers say", () => {
    const headers = new Headers({ host: "internal:3000", "x-forwarded-proto": "http" });
    expect(appOrigin(headers, PROD)).toBe("https://checkin.example.org");
  });

  it("throws in production without APP_ORIGIN, rather than trusting headers", () => {
    const headers = new Headers({ host: "checkin.example.org" });
    expect(() => appOrigin(headers, { NODE_ENV: "production" })).toThrow(
      /APP_ORIGIN/,
    );
  });

  describe("guessing from the request (development only)", () => {
    it("uses the Host header over plain http by default", () => {
      expect(appOrigin(new Headers({ host: "localhost:3000" }), DEV)).toBe(
        "http://localhost:3000",
      );
    });

    it("uses the scheme a proxy reports", () => {
      const headers = new Headers({
        host: "checkin.example.org",
        "x-forwarded-proto": "https",
      });
      expect(appOrigin(headers, DEV)).toBe("https://checkin.example.org");
    });

    it("takes the first scheme when proxies send a list", () => {
      const headers = new Headers({
        host: "checkin.example.org",
        "x-forwarded-proto": "https, http",
      });
      expect(appOrigin(headers, DEV)).toBe("https://checkin.example.org");
    });

    it("ignores a scheme that isn't http or https", () => {
      const headers = new Headers({
        host: "localhost:3000",
        "x-forwarded-proto": "javascript",
      });
      expect(appOrigin(headers, DEV)).toBe("http://localhost:3000");
    });

    it("throws without a Host header", () => {
      expect(() => appOrigin(new Headers(), DEV)).toThrow(/Host/);
    });
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
