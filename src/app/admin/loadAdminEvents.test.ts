import { describe, expect, it, vi } from "vitest";
import { TidyError } from "@/lib/tidyhq/errors";
import { MockTidyClient } from "@/lib/tidyhq/mock/MockTidyClient";
import { createSeed } from "@/lib/tidyhq/mock/seed";
import { loadAdminEvents } from "./loadAdminEvents";

const NOW = new Date("2026-10-12T18:00:00Z");

function client() {
  return new MockTidyClient(createSeed(NOW), () => NOW);
}

describe("loadAdminEvents", () => {
  it("returns the events", async () => {
    const events = await loadAdminEvents(client(), { now: NOW });
    expect(events?.upcoming.length).toBeGreaterThan(0);
  });

  it("returns null when TidyHQ fails, logging status and message", async () => {
    const c = client();
    vi.spyOn(c, "listEvents").mockRejectedValue(
      new TidyError(401, "bad token"),
    );
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(loadAdminEvents(c, { now: NOW })).resolves.toBeNull();
    expect(error).toHaveBeenCalledWith(
      "Couldn't load admin events:",
      "TidyError 401: bad token",
    );
    error.mockRestore();
  });

  it("lets a non-TidyHQ error through", async () => {
    const c = client();
    vi.spyOn(c, "listEvents").mockRejectedValue(new TypeError("bug"));
    await expect(loadAdminEvents(c, { now: NOW })).rejects.toThrow("bug");
  });
});
