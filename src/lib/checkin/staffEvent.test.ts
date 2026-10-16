import { describe, expect, it } from "vitest";
import { MockTidyClient } from "../tidyhq/mock/MockTidyClient";
import { createSeed } from "../tidyhq/mock/seed";
import { staffEventState } from "./staffEvent";

const NOW = new Date("2026-10-12T18:00:00Z");

function stateFor(
  eventId: string,
  edit?: (seed: ReturnType<typeof createSeed>) => void,
) {
  const seed = createSeed(NOW);
  edit?.(seed);
  return staffEventState(new MockTidyClient(seed, () => NOW), eventId, NOW);
}

describe("staffEventState", () => {
  it("is running for an event whose check-in is open, carrying what it read", async () => {
    const state = await stateFor("ev_tonight");
    expect(state).toMatchObject({
      status: "running",
      eventName: "Social Night",
      loaded: { groupId: "grp_social_night" },
    });
  });

  it("stays running before check-in opens, so volunteers can set up", async () => {
    expect(await stateFor("ev_bootblack_social")).toMatchObject({
      status: "running",
    });
  });

  it("has ended once check-in has closed", async () => {
    expect(await stateFor("ev_pub_night")).toMatchObject({
      status: "ended",
      reason: "closed",
    });
  });

  it("has ended for an archived event, even with an open window", async () => {
    expect(
      await stateFor("ev_tonight", (seed) => {
        seed.events.find((e) => e.id === "ev_tonight")!.archived = true;
      }),
    ).toMatchObject({ status: "ended", reason: "archived" });
  });

  it("has ended for an event with no attendance group", async () => {
    expect(
      await stateFor("ev_ungrouped", (seed) => {
        seed.events.push({
          ...seed.events.find((e) => e.id === "ev_tonight")!,
          id: "ev_ungrouped",
        });
      }),
    ).toMatchObject({ status: "ended", reason: "no_group" });
  });

  it("has ended when check-in can never open", async () => {
    expect(
      await stateFor("ev_tonight", (seed) => {
        delete seed.checkinWindows.ev_tonight;
        seed.events.find((e) => e.id === "ev_tonight")!.start_at = "not a time";
      }),
    ).toMatchObject({ status: "ended", reason: "never_opens" });
  });

  it("is unknown for an event TidyHQ doesn't have", async () => {
    expect(await stateFor("ev_nope")).toEqual({ status: "unknown_event" });
  });
});
