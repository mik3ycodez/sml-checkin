import { describe, expect, it, vi } from "vitest";
import { TidyError } from "@/lib/tidyhq/errors";
import { MockTidyClient } from "@/lib/tidyhq/mock/MockTidyClient";
import { createSeed } from "@/lib/tidyhq/mock/seed";
import { loadRecentEvents } from "./loadRecentEvents";

const NOW = new Date("2026-10-12T18:00:00Z");

function client() {
  return new MockTidyClient(createSeed(NOW), () => NOW);
}

describe("loadRecentEvents", () => {
  it("returns the events the member attended", async () => {
    const events = await loadRecentEvents(client(), {
      contactId: "c_marcus",
      now: NOW,
    });
    expect(events?.map((e) => e.name)).toEqual(["Pub Night"]);
  });

  it("returns null when TidyHQ fails, instead of throwing", async () => {
    const c = client();
    vi.spyOn(c, "listContactGroups").mockRejectedValue(
      new TidyError(500, "boom"),
    );
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      loadRecentEvents(c, { contactId: "c_marcus", now: NOW }),
    ).resolves.toBeNull();
    // Logged for us, without the error's details leaking anywhere visible.
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
