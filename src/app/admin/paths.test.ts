import { describe, expect, it } from "vitest";
import {
  ADMIN_DENIED_PATH,
  adminDeniedPath,
  adminEventPath,
  deniedReason,
  deniedRetryPath,
  staffCheckinEventId,
  staffCheckinPath,
  staffMemberPath,
  deniedSignInReturn,
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

describe("staffCheckinPath", () => {
  it("is the event's admin path plus /checkin, with the id encoded", () => {
    expect(staffCheckinPath("ev_tonight")).toBe(
      "/admin/events/ev_tonight/checkin",
    );
    expect(staffCheckinPath("a/b?c")).toBe("/admin/events/a%2Fb%3Fc/checkin");
  });
});

describe("the staff check-in page and the denied screen", () => {
  it("is retried after a failed access check, and remembered for both reasons", () => {
    const back = "/admin/events/ev_one/checkin";
    expect(deniedRetryPath(back)).toBe(back);
    expect(adminDeniedPath("unavailable", back)).toBe(
      `${ADMIN_DENIED_PATH}?reason=unavailable&returnTo=%2Fadmin%2Fevents%2Fev_one%2Fcheckin`,
    );
    expect(adminDeniedPath("not_admin", back)).toBe(
      `${ADMIN_DENIED_PATH}?reason=not_admin&returnTo=%2Fadmin%2Fevents%2Fev_one%2Fcheckin`,
    );
  });

  it("reads the event id back out of the staff path, decoded", () => {
    expect(staffCheckinEventId("/admin/events/ev_one/checkin")).toBe("ev_one");
    expect(staffCheckinEventId("/admin/events/a%2Fb/checkin")).toBe("a/b");
  });

  it.each([
    undefined,
    "/admin/events/ev_one",
    "/admin/events/ev_one/checkin/x",
    "/admin/events/../checkin",
    "/admin/events//checkin",
    "/admin/events/ev_one/checkin?x=1",
    "//evil.example/admin/events/x/checkin",
    "/admin/events/%E0%A4%A/checkin",
  ])("refuses %j as a staff check-in path", (value) => {
    expect(staffCheckinEventId(value)).toBeNull();
  });
});

describe("staffMemberPath", () => {
  it("picks a member, keeping the search and any problem, all encoded", () => {
    expect(staffMemberPath("ev_one", "c_dante")).toBe(
      "/admin/events/ev_one/checkin?member=c_dante",
    );
    expect(
      staffMemberPath("ev_one", "c_dante", {
        problem: "nothing_saved",
        q: "Dan te&",
      }),
    ).toBe(
      "/admin/events/ev_one/checkin?member=c_dante&problem=nothing_saved&q=Dan%20te%26",
    );
  });
  it("leaves out an empty search", () => {
    expect(staffMemberPath("ev_one", "c_dante", { q: "" })).toBe(
      "/admin/events/ev_one/checkin?member=c_dante",
    );
  });
});

describe("deniedSignInReturn", () => {
  it("returns a person turned away from staff check-in to that page", () => {
    expect(deniedSignInReturn("/admin/events/ev_one/checkin")).toBe(
      "/admin/events/ev_one/checkin",
    );
  });
  it.each([undefined, "/admin/events/ev_one", "//evil.example", "/other"])(
    "sends everyone else (%j) to /admin",
    (value) => {
      expect(deniedSignInReturn(value)).toBe("/admin");
    },
  );
});
