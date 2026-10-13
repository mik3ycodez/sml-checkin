import { describe, expect, it } from "vitest";
import { MockTidyClient } from "../tidyhq/mock/MockTidyClient";
import { createSeed } from "../tidyhq/mock/seed";
import { recalculatePoints } from "./recalculatePoints";

const NOW = new Date("2026-10-12T18:00:00Z");

function seededClient(edit?: (seed: ReturnType<typeof createSeed>) => void) {
  const seed = createSeed(NOW);
  edit?.(seed);
  return new MockTidyClient(seed, () => NOW);
}

describe("recalculatePoints", () => {
  it("counts each attendance group the member is in", async () => {
    const client = seededClient();
    expect(await recalculatePoints(client, "c_marcus")).toBe(1);
    expect(await recalculatePoints(client, "c_dante")).toBe(0);
  });

  it("counts every event ever attended, past and present", async () => {
    const client = seededClient();
    await client.addContactToGroup("grp_social_night", "c_marcus");
    expect(await recalculatePoints(client, "c_marcus")).toBe(2);
  });

  it("ignores the stored points field", async () => {
    const client = seededClient((seed) => {
      const marcus = seed.contacts.find((c) => c.id === "c_marcus")!;
      marcus.custom_fields.cf_sml_points.value = "7";
    });
    expect(await recalculatePoints(client, "c_marcus")).toBe(1);
  });

  it("skips events with no attendance group", async () => {
    const client = seededClient((seed) => {
      seed.events.push({ ...seed.events[0], id: "ev_unmapped" });
    });
    expect(await recalculatePoints(client, "c_marcus")).toBe(1);
  });

  it("does not write the total back", async () => {
    const client = seededClient();
    await client.addContactToGroup("grp_social_night", "c_dante");
    await recalculatePoints(client, "c_dante");
    const dante = await client.getContact("c_dante");
    expect(dante.custom_fields.cf_sml_points.value).toBe("0");
  });
});
