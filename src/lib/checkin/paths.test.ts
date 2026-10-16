import { describe, expect, it } from "vitest";
import { adminEventPath, staffCheckinPath } from "./paths";
import * as adminPaths from "../../app/admin/paths";

describe("event paths", () => {
  it("encodes the id so it can't alter the path", () => {
    expect(adminEventPath("a/b")).toBe("/admin/events/a%2Fb");
    expect(staffCheckinPath("a/b")).toBe("/admin/events/a%2Fb/checkin");
  });

  it("are the same functions the admin routes use", () => {
    expect(adminPaths.adminEventPath).toBe(adminEventPath);
    expect(adminPaths.staffCheckinPath).toBe(staffCheckinPath);
  });
});
