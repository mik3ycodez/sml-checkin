import { describe, expect, it } from "vitest";
import { ADMIN_DENIED_PATH, adminDeniedPath, deniedReason } from "./paths";

describe("adminDeniedPath", () => {
  it("names the reason in the query", () => {
    expect(adminDeniedPath("not_admin")).toBe(
      `${ADMIN_DENIED_PATH}?reason=not_admin`,
    );
    expect(adminDeniedPath("unavailable")).toBe(
      `${ADMIN_DENIED_PATH}?reason=unavailable`,
    );
  });
});

describe("deniedReason", () => {
  it("reads the two known reasons", () => {
    expect(deniedReason("not_admin")).toBe("not_admin");
    expect(deniedReason("unavailable")).toBe("unavailable");
  });

  it.each([undefined, "", "admin", "x", ["unavailable", "x"]])(
    "treats %j as not_admin, so the page never claims more than it knows",
    (value) => {
      expect(deniedReason(value)).toBe("not_admin");
    },
  );
});
