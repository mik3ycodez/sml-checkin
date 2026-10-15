import { describe, expect, it } from "vitest";
import {
  COLORS_ISSUED_FIELD_ID,
  POINTS_FIELD_ID,
  readPoints,
  readRewardIssued,
} from "./customFields";
import type { CustomField } from "./types";

function withPoints(value: CustomField["value"]) {
  return {
    custom_fields: {
      [POINTS_FIELD_ID]: {
        id: POINTS_FIELD_ID,
        title: "SML Points",
        type: "string" as const,
        value,
      },
    },
  };
}

describe("readPoints", () => {
  it("reads a plain whole number", () => {
    expect(readPoints(withPoints("42"))).toBe(42);
    expect(readPoints(withPoints("0"))).toBe(0);
  });

  it("ignores surrounding spaces and commas", () => {
    expect(readPoints(withPoints(" 1,234 "))).toBe(1234);
  });

  it("reads an unset field as 0", () => {
    expect(readPoints({ custom_fields: {} })).toBe(0);
    expect(readPoints(withPoints(""))).toBe(0);
    expect(readPoints(withPoints("   "))).toBe(0);
  });

  it.each(["12.5", "-5", "abc", "12 pts", "1e3", "+3", "1 234"])(
    "treats %j as unreadable",
    (value) => {
      expect(readPoints(withPoints(value))).toBeNull();
    },
  );

  it("treats a non-text value as unreadable", () => {
    expect(readPoints(withPoints(true))).toBeNull();
  });
});

describe("readRewardIssued", () => {
  const withIssued = (value: CustomField["value"]) => ({
    custom_fields: {
      [COLORS_ISSUED_FIELD_ID]: {
        id: COLORS_ISSUED_FIELD_ID,
        title: "Club colors issued",
        type: "string" as const,
        value,
      },
    },
  });

  it("reads yes as issued", () => {
    expect(readRewardIssued(withIssued("yes"), "club_colors")).toBe(true);
    expect(readRewardIssued(withIssued(" yes "), "club_colors")).toBe(true);
  });

  it("reads a missing or blank field as not issued", () => {
    expect(readRewardIssued({ custom_fields: {} }, "club_colors")).toBe(false);
    expect(readRewardIssued(withIssued(""), "club_colors")).toBe(false);
    expect(readRewardIssued(withIssued("  "), "club_colors")).toBe(false);
  });

  it.each(["no", "Yes", "true", "1", "issued"])(
    "treats %j as unreadable",
    (value) => {
      expect(readRewardIssued(withIssued(value), "club_colors")).toBeNull();
    },
  );

  it("treats a non-text value as unreadable", () => {
    expect(readRewardIssued(withIssued(true), "club_colors")).toBeNull();
  });
});
