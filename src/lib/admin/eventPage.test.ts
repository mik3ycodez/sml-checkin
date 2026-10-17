import { describe, expect, it } from "vitest";
import { MockTidyClient } from "../tidyhq/mock/MockTidyClient";
import { createSeed } from "../tidyhq/mock/seed";
import { assessCheckIn } from "../checkin/checkIn";
import { getAdminEventPage } from "./eventPage";

const NOW = new Date("2026-10-12T18:00:00Z");

function clientWith(edit: (seed: ReturnType<typeof createSeed>) => void) {
  const seed = createSeed(NOW);
  edit(seed);
  return new MockTidyClient(seed, () => NOW);
}

const load = (client: MockTidyClient, id: string) =>
  getAdminEventPage(client, id, { now: NOW });

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
      qr: { kind: "qr", path: "/checkin/ev_tonight" },
      checkin: "open",
      windowWarning: null,
    });
    expect(page!.window.source).toBe("event");
    expect(page!.startAt).toBeTruthy();
    expect(page!.endAt).toBeTruthy();
  });

  it("reads the event and its window together, not one after the other", async () => {
    const client = clientWith(() => {});
    const readWindow = client.getEventCheckinWindow.bind(client);
    const readEvent = client.getEvent.bind(client);
    let windowRequested!: () => void;
    const requested = new Promise<void>(
      (resolve) => (windowRequested = resolve),
    );
    // The event read can't finish until the window read has started, so a
    // page that waits for the event first never gets there.
    client.getEvent = async (id) => {
      await requested;
      return readEvent(id);
    };
    client.getEventCheckinWindow = (id) => {
      windowRequested();
      return readWindow(id);
    };
    expect((await load(client, "ev_tonight"))!.name).toBe("Social Night");
  });

  it("returns null when the window read finds no event either", async () => {
    expect(
      await load(
        clientWith(() => {}),
        "ev_nope",
      ),
    ).toBeNull();
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

  it("doesn't warn when the window times are only spaces", async () => {
    const client = clientWith((seed) => {
      seed.checkinWindows.ev_bootblack_social = {
        opens_at: " ",
        closes_at: "",
      };
    });
    expect(
      (await load(client, "ev_bootblack_social"))!.windowWarning,
    ).toBeNull();
  });

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
      // Its window is fine, but members can't check in, so it isn't "not yet".
      expect(page!.checkin).toBe("unavailable");
    });

    it("is withheld when the event has no attendance group", async () => {
      const client = clientWith((seed) => {
        seed.events.push({
          ...seed.events.find((e) => e.id === "ev_bar_night")!,
          id: "ev_ungrouped",
          attendance_group_id: null,
        });
      });
      const page = await load(client, "ev_ungrouped");
      expect(page!.qr).toEqual({ kind: "none", reason: "no_group" });
      // A valid window, but "open" would be untrue: every scan fails.
      expect(page!.checkin).toBe("unavailable");
    });

    it("is withheld when check-in can never open: no usable window or event times", async () => {
      const client = clientWith((seed) => {
        const event = seed.events.find((e) => e.id === "ev_bar_night")!;
        event.start_at = null;
        event.end_at = null;
      });
      const page = await load(client, "ev_bar_night");
      expect(page!.qr).toEqual({ kind: "none", reason: "never_opens" });
      expect(page!.checkin).toBe("unavailable");
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

    it("agrees with check-in: every event without a code is one members can't check in to", async () => {
      const client = clientWith((seed) => {
        const tonight = seed.events.find((e) => e.id === "ev_tonight")!;
        const brunch = seed.events.find((e) => e.id === "ev_leather_brunch")!;
        tonight.archived = true; // open window, but archived
        brunch.start_at = brunch.end_at = null; // can never open
        delete seed.checkinWindows.ev_leather_brunch;
        seed.events.push({
          ...tonight,
          id: "ev_ungrouped",
          archived: false,
          attendance_group_id: null,
        });
      });
      for (const id of ["ev_tonight", "ev_leather_brunch", "ev_ungrouped"]) {
        expect((await load(client, id))!.qr.kind, id).toBe("none");
        const result = await assessCheckIn(client, {
          eventId: id,
          contactId: "c_dante",
          now: NOW,
        });
        expect(["ready", "already_checked_in"], id).not.toContain(
          result.status,
        );
      }
      // And the reverse: with a code, a current member is ready to check in.
      const fine = await assessCheckIn(
        clientWith(() => {}),
        {
          eventId: "ev_tonight",
          contactId: "c_dante",
          now: NOW,
        },
      );
      expect(fine.status).toBe("ready");
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
