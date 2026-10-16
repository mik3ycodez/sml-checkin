import { describe, expect, it } from "vitest";
import { MockTidyClient } from "../tidyhq/mock/MockTidyClient";
import { createSeed } from "../tidyhq/mock/seed";
import { getAdminEventPage } from "./eventPage";

const NOW = new Date("2026-10-12T18:00:00Z");
const URL_OF = (id: string) => `https://checkin.example.org/checkin/${id}`;

function clientWith(edit: (seed: ReturnType<typeof createSeed>) => void) {
  const seed = createSeed(NOW);
  edit(seed);
  return new MockTidyClient(seed, () => NOW);
}

const load = (client: MockTidyClient, id: string) =>
  getAdminEventPage(client, id, {
    origin: "https://checkin.example.org",
    now: NOW,
  });

describe("getAdminEventPage", () => {
  it("returns null for an event TidyHQ doesn't have", async () => {
    expect(
      await load(
        clientWith(() => {}),
        "ev_nope",
      ),
    ).toBeNull();
  });

  it("describes an open event and its check-in link", async () => {
    const page = await load(
      clientWith(() => {}),
      "ev_tonight",
    );
    expect(page).toMatchObject({
      id: "ev_tonight",
      name: "Social Night",
      location: "The Eagle, Seattle",
      archived: false,
      qr: { kind: "qr", url: URL_OF("ev_tonight") },
      checkin: "open",
      windowWarning: null,
    });
    expect(page!.window.source).toBe("event");
    expect(page!.startAt).toBeTruthy();
    expect(page!.endAt).toBeTruthy();
  });

  it("uses the event's start and end when it has no window, and shows the QR", async () => {
    const page = await load(
      clientWith(() => {}),
      "ev_bar_night",
    );
    expect(page!.window.source).toBe("fallback");
    expect(page!.windowWarning).toBeNull();
    expect(page!.qr.kind).toBe("qr");
    expect(page!.checkin).toBe("not_yet");
  });

  it("still shows the QR for a past event whose window has closed", async () => {
    const page = await load(
      clientWith(() => {}),
      "ev_pub_night",
    );
    expect(page!.checkin).toBe("closed");
    expect(page!.qr.kind).toBe("qr");
  });

  it.each([
    ["half_filled", { opens_at: "", closes_at: "2026-10-20T04:00:00Z" }],
    ["unparseable", { opens_at: "2026-10-20T01:00:00Z", closes_at: "late" }],
    [
      "backwards",
      { opens_at: "2026-10-20T04:00:00Z", closes_at: "2026-10-20T01:00:00Z" },
    ],
  ])(
    "warns about a %s window and says check-in uses the event's times",
    async (reason, bad) => {
      const client = clientWith((seed) => {
        seed.checkinWindows.ev_bootblack_social = bad;
      });
      const page = await load(client, "ev_bootblack_social");
      expect(page!.windowWarning).toBe(reason);
      expect(page!.window.source).toBe("fallback");
      expect(page!.qr.kind).toBe("qr");
    },
  );

  it("doesn't warn when both window times are blank", async () => {
    const client = clientWith((seed) => {
      seed.checkinWindows.ev_bootblack_social = { opens_at: "", closes_at: "" };
    });
    expect(
      (await load(client, "ev_bootblack_social"))!.windowWarning,
    ).toBeNull();
  });

  describe("no QR code", () => {
    it("is withheld for an archived event, with the reason", async () => {
      const client = clientWith((seed) => {
        seed.events.find((e) => e.id === "ev_bootblack_social")!.archived =
          true;
      });
      const page = await load(client, "ev_bootblack_social");
      expect(page!.archived).toBe(true);
      expect(page!.qr).toEqual({ kind: "none", reason: "archived" });
    });

    it("is withheld when the event has no attendance group", async () => {
      const client = clientWith((seed) => {
        seed.events.push({
          ...seed.events.find((e) => e.id === "ev_bar_night")!,
          id: "ev_ungrouped",
        });
      });
      const page = await load(client, "ev_ungrouped");
      expect(page!.qr).toEqual({ kind: "none", reason: "no_group" });
    });

    it("is withheld when check-in can never open: no usable window or event times", async () => {
      const client = clientWith((seed) => {
        const event = seed.events.find((e) => e.id === "ev_bar_night")!;
        event.start_at = null;
        event.end_at = null;
      });
      const page = await load(client, "ev_bar_night");
      expect(page!.qr).toEqual({ kind: "none", reason: "never_opens" });
      expect(page!.checkin).toBe("closed");
    });

    it("is withheld when a bad admin window falls back to bad event times, and the warning still shows", async () => {
      const client = clientWith((seed) => {
        const event = seed.events.find((e) => e.id === "ev_bootblack_social")!;
        [event.start_at, event.end_at] = [event.end_at, event.start_at];
        seed.checkinWindows.ev_bootblack_social = {
          opens_at: "",
          closes_at: "2026-10-20T04:00:00Z",
        };
      });
      const page = await load(client, "ev_bootblack_social");
      expect(page!.qr).toEqual({ kind: "none", reason: "never_opens" });
      expect(page!.windowWarning).toBe("half_filled");
    });

    it("gives the archived reason first when several apply", async () => {
      const client = clientWith((seed) => {
        const event = seed.events.find((e) => e.id === "ev_bar_night")!;
        event.archived = true;
        event.start_at = null;
      });
      expect((await load(client, "ev_bar_night"))!.qr).toEqual({
        kind: "none",
        reason: "archived",
      });
    });
  });

  it("treats a blank name or location as missing", async () => {
    const client = clientWith((seed) => {
      const event = seed.events.find((e) => e.id === "ev_tonight")!;
      event.name = "  ";
      event.location = "";
    });
    const page = await load(client, "ev_tonight");
    expect(page!.name).toBeNull();
    expect(page!.location).toBeNull();
  });
});
