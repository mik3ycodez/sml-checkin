import { describe, expect, it } from "vitest";
import { isTidyError, TidyError } from "./errors";

/** A TidyError from another bundle's copy of the class: same shape, not instanceof. */
class OtherCopyTidyError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "TidyError";
  }
}

describe("isTidyError", () => {
  it("recognizes a TidyError", () => {
    expect(isTidyError(new TidyError(401, "bad token"))).toBe(true);
  });

  it("recognizes a TidyError from another copy of the class", () => {
    const error = new OtherCopyTidyError(401, "bad code");
    expect(error instanceof TidyError).toBe(false);
    expect(isTidyError(error)).toBe(true);
  });

  it("checks the status when one is given", () => {
    expect(isTidyError(new TidyError(404, "missing"), 404)).toBe(true);
    expect(isTidyError(new TidyError(401, "bad token"), 404)).toBe(false);
  });

  it.each([
    ["a plain Error", new Error("boom")],
    ["an Error named TidyError without a status", Object.assign(new Error("x"), { name: "TidyError" })],
    ["a string", "TidyError"],
    ["null", null],
  ])("rejects %s", (_label, value) => {
    expect(isTidyError(value)).toBe(false);
  });
});
