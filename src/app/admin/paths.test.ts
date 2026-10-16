import { describe, expect, it } from "vitest";
import {
  ADMIN_DENIED_PATH,
  adminDeniedPath,
  adminEventPath,
  checkinUrl,
  deniedReason,
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

describe("checkinUrl", () => {
  it("is the site's origin plus the member check-in path", () => {
    expect(checkinUrl("https://checkin.example.org", "ev_tonight")).toBe(
      "https://checkin.example.org/checkin/ev_tonight",
    );
  });

  it("encodes the id so it can't change the path", () => {
    expect(checkinUrl("https://checkin.example.org", "a/b?c")).toBe(
      "https://checkin.example.org/checkin/a%2Fb%3Fc",
    );
  });
});
