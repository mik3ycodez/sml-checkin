import { describe, expect, it } from "vitest";
import { findEventGroup } from "./eventGroups";

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
