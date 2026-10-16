import { describe, expect, it } from "vitest";
import {
  ADMIN_DENIED_PATH,
  adminDeniedPath,
  adminEventPath,
  deniedReason,
  deniedRetryPath,
} from "./paths";

describe("adminEventPath", () => {
  it("encodes the id so it can't change the path", () => {
    expect(adminEventPath("ev_tonight")).toBe("/admin/events/ev_tonight");
    expect(adminEventPath("a/b?c")).toBe("/admin/events/a%2Fb%3Fc");
  });
});

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

describe("adminDeniedPath from an event page", () => {
  it("remembers the event page when access couldn't be checked, so the denied screen can retry it", () => {
    expect(adminDeniedPath("unavailable", "/admin/events/ev_one")).toBe(
      `${ADMIN_DENIED_PATH}?reason=unavailable&returnTo=%2Fadmin%2Fevents%2Fev_one`,
    );
  });

  it("doesn't carry it for not_admin, or for pages that aren't an event page", () => {
    expect(adminDeniedPath("not_admin", "/admin/events/ev_one")).toBe(
      `${ADMIN_DENIED_PATH}?reason=not_admin`,
    );
    expect(adminDeniedPath("unavailable", "/admin")).toBe(
      `${ADMIN_DENIED_PATH}?reason=unavailable`,
    );
  });
});

describe("deniedRetryPath", () => {
  it("accepts an event page path", () => {
    expect(deniedRetryPath("/admin/events/ev_one")).toBe(
      "/admin/events/ev_one",
    );
    expect(deniedRetryPath("/admin/events/a%2Fb")).toBe("/admin/events/a%2Fb");
  });

  it.each([
    undefined,
    "",
    "/admin",
    "/admin/events",
    "/admin/events/",
    "/admin/events/ev_one/extra",
    "/admin/events/..",
    "/admin/events/ev_one?x=1",
    "//evil.example/admin/events/x",
    "https://evil.example/admin/events/x",
    "/admin/events/x\\y",
    "/other/events/ev_one",
    ["/admin/events/a", "/admin/events/b"],
  ])("refuses %j, so the refresh can only go to an event page", (value) => {
    expect(deniedRetryPath(value)).toBeNull();
  });
});
