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
  it("is open for an event whose check-in is open", async () => {
    expect(await stateFor("ev_tonight")).toEqual({
      status: "running",
      eventName: "Social Night",
    });
  });

  it("stays available before check-in opens, so volunteers can set up", async () => {
    expect(await stateFor("ev_bootblack_social")).toMatchObject({
      status: "running",
    });
  });

  it("has ended once check-in has closed", async () => {
    expect(await stateFor("ev_pub_night")).toMatchObject({ status: "ended" });
  });

  it("has ended for an archived event, even with an open window", async () => {
    expect(
      await stateFor("ev_tonight", (seed) => {
        seed.events.find((e) => e.id === "ev_tonight")!.archived = true;
      }),
    ).toMatchObject({ status: "ended" });
  });

  it("has ended when check-in can never open", async () => {
    expect(
      await stateFor("ev_tonight", (seed) => {
        delete seed.checkinWindows.ev_tonight;
        const e = seed.events.find((e) => e.id === "ev_tonight")!;
        e.start_at = "not a time";
      }),
    ).toMatchObject({ status: "ended" });
  });

  it("is unknown for an event TidyHQ doesn't have", async () => {
    expect(await stateFor("ev_nope")).toEqual({ status: "unknown_event" });
  });
});
