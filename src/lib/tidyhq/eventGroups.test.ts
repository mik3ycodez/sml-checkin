import { describe, expect, it } from "vitest";
import { TidyError } from "./errors";
import { findEventGroup, resolveEventGroup } from "./eventGroups";

describe("findEventGroup", () => {
  it("returns the attendance group the event carries", () => {
    expect(findEventGroup({ attendance_group_id: "grp_pub_night" })).toBe(
      "grp_pub_night",
    );
  });

  it.each([{}, { attendance_group_id: null }, { attendance_group_id: "" }])(
    "returns null for an event with no group (%j)",
    (event) => {
      expect(findEventGroup(event)).toBeNull();
    },
  );

  it("does not use TidyHQ's group_id: that group follows ticket holders", () => {
    const event: { group_id: string; attendance_group_id?: string } = {
      group_id: "g_tickets",
    };
    expect(findEventGroup(event)).toBeNull();
  });
});

describe("resolveEventGroup", () => {
  it("returns the group", () => {
    expect(resolveEventGroup({ attendance_group_id: "grp_a" })).toBe("grp_a");
  });

  it("throws 404 for an event with no group", () => {
    let error: unknown;
    try {
      resolveEventGroup({});
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(TidyError);
    expect((error as TidyError).status).toBe(404);
  });
});
