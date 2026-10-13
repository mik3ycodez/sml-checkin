import { describe, expect, it } from "vitest";
import { TidyError } from "./errors";
import {
  findEventGroup,
  listAttendanceGroups,
  resolveEventGroup,
} from "./eventGroups";

describe("findEventGroup", () => {
  it("returns the attendance group for a mapped event", () => {
    expect(findEventGroup({ id: "ev_pub_night" })).toBe("grp_pub_night");
  });

  it("returns null for an event with no group", () => {
    expect(findEventGroup({ id: "ev_unmapped" })).toBeNull();
  });
});

describe("resolveEventGroup", () => {
  it("throws 404 for an event with no group", () => {
    let error: unknown;
    try {
      resolveEventGroup({ id: "ev_unmapped" });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(TidyError);
    expect((error as TidyError).status).toBe(404);
  });
});

describe("listAttendanceGroups", () => {
  it("lists every event's attendance group", () => {
    const groups = listAttendanceGroups();
    expect(groups).toContainEqual({
      eventId: "ev_pub_night",
      groupId: "grp_pub_night",
    });
    for (const { eventId, groupId } of groups) {
      expect(findEventGroup({ id: eventId })).toBe(groupId);
    }
  });
});
