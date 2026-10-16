import { afterEach, describe, expect, it, vi } from "vitest";
import { TidyError } from "@/lib/tidyhq/errors";
import { loadOrNull } from "./loadOrNull";

afterEach(() => vi.restoreAllMocks());

describe("loadOrNull", () => {
  it("returns the value when the read works", async () => {
    await expect(loadOrNull("things", async () => [1, 2])).resolves.toEqual([
      1, 2,
    ]);
  });

  it("returns null for a TidyHQ error, logging its status and message", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      loadOrNull("Couldn't load things", async () => {
        throw new TidyError(401, "bad token");
      }),
    ).resolves.toBeNull();
    expect(error).toHaveBeenCalledWith(
      "Couldn't load things:",
      "TidyError 401: bad token",
    );
  });

  it("rethrows anything that isn't a TidyHQ error, so bugs aren't hidden", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      loadOrNull("things", async () => {
        throw new TypeError("oops");
      }),
    ).rejects.toThrow("oops");
    expect(error).not.toHaveBeenCalled();
  });
});
