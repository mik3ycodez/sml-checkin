import { describe, expect, it } from "vitest";
import { tidyhqSiteUrl } from "./site";

describe("tidyhqSiteUrl", () => {
  it("is SML's TidyHQ site, from the domain prefix", () => {
    expect(tidyhqSiteUrl("sml")).toBe("https://sml.tidyhq.com");
  });

  it("defaults to sml when no prefix is set", () => {
    expect(tidyhqSiteUrl(undefined)).toBe("https://sml.tidyhq.com");
    expect(tidyhqSiteUrl("  ")).toBe("https://sml.tidyhq.com");
  });

  it("ignores surrounding spaces and case", () => {
    expect(tidyhqSiteUrl(" SML-Seattle ")).toBe(
      "https://sml-seattle.tidyhq.com",
    );
  });

  it.each(["evil.com/x", "sml.evil", "a b", "sml/", "-sml"])(
    "refuses %j, so the renew link can't point at another site",
    (prefix) => {
      expect(() => tidyhqSiteUrl(prefix)).toThrow(/TIDYHQ_DOMAIN_PREFIX/);
    },
  );
});
