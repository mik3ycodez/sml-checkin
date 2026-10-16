import { describe, expect, it } from "vitest";
import { UNNAMED, contactName } from "./contactName";

describe("contactName", () => {
  it("uses the display name, trimmed", () => {
    expect(
      contactName({
        display_name: "  Marcus Bell ",
        first_name: "M",
        last_name: "B",
      }),
    ).toBe("Marcus Bell");
  });

  it("falls back to first and last name when the display name is blank", () => {
    expect(
      contactName({
        display_name: "   ",
        first_name: "Marcus",
        last_name: "Bell",
      }),
    ).toBe("Marcus Bell");
    expect(
      contactName({ display_name: "", first_name: "Marcus", last_name: "" }),
    ).toBe("Marcus");
  });

  it("says unnamed when there's nothing to show", () => {
    expect(UNNAMED).toBe("Unnamed member");
    expect(
      contactName({ display_name: "", first_name: " ", last_name: "" }),
    ).toBe(UNNAMED);
  });

  it("copes with null, missing, or non-text fields, never throwing or printing 'null'", () => {
    const odd = (v: unknown) => v as string;
    expect(
      contactName({
        display_name: odd(null),
        first_name: "Marcus",
        last_name: odd(null),
      }),
    ).toBe("Marcus");
    expect(contactName({})).toBe(UNNAMED);
    expect(
      contactName({
        display_name: odd(42),
        first_name: odd(undefined),
        last_name: odd({}),
      }),
    ).toBe(UNNAMED);
  });
});
