import { describe, expect, it } from "vitest";
import { safeReturnTo } from "./returnTo";

describe("safeReturnTo", () => {
  it.each(["/", "/checkin/x", "/checkin/ev_tonight?ref=qr", "/status#points"])(
    "allows the path %s on this site",
    (path) => {
      expect(safeReturnTo(path)).toBe(path);
    },
  );

  it.each([
    ["protocol-relative", "//evil.com"],
    ["backslash", "/\\evil.com"],
    ["absolute https", "https://evil.com/checkin/x"],
    ["absolute http", "http://evil.com"],
    ["javascript", "javascript:alert(1)"],
    ["relative", "checkin/x"],
    ["leading space", " /checkin/x"],
    ["embedded newline", "/checkin/x\n"],
    ["tab after slash", "/\t/evil.com"],
    ["dot-dot then double slash", "/..//evil.com"],
    ["double slash later in the path", "/checkin//evil.com"],
    ["backslash later in the path", "/checkin/\\evil.com"],
    ["dot-dot segment", "/checkin/../status"],
    ["trailing dot-dot segment", "/checkin/.."],
  ])("falls back to / for a %s value", (_label, value) => {
    expect(safeReturnTo(value)).toBe("/");
  });

  it("allows dots that aren't a .. segment", () => {
    expect(safeReturnTo("/checkin/ev..x")).toBe("/checkin/ev..x");
  });

  it.each([undefined, null, ""])("falls back to / for %j", (value) => {
    expect(safeReturnTo(value)).toBe("/");
  });

  it("uses a custom fallback when given", () => {
    expect(safeReturnTo("//evil.com", "/status")).toBe("/status");
  });
});
