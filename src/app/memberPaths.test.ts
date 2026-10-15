import { describe, expect, it } from "vitest";
import { ME_PATH, signInPath } from "./memberPaths";

describe("memberPaths", () => {
  it("names the status page", () => {
    expect(ME_PATH).toBe("/me");
  });

  it("builds a sign-in path that returns to the given page", () => {
    expect(signInPath("/me")).toBe("/auth/signin?returnTo=%2Fme");
    expect(signInPath("/checkin/ev_tonight")).toBe(
      "/auth/signin?returnTo=%2Fcheckin%2Fev_tonight",
    );
  });
});
