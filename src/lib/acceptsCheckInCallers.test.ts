// One rule, `acceptsCheckIn`, decides whether an event takes check-ins at all,
// and it sits in `checkinBlocker` next to "archived". This swaps its answer
// and checks that every place that decides agrees: the admin event page's QR
// code, the volunteer page, and check-in itself.

import { describe, expect, it, vi } from "vitest";
import { getAdminEventPage } from "./admin/eventPage";
import { assessCheckIn } from "./checkin/checkIn";
import { staffEventState } from "./checkin/staffEvent";
import { acceptsCheckIn } from "./tidyhq/acceptsCheckIn";
import { MockTidyClient } from "./tidyhq/mock/MockTidyClient";
import { createSeed } from "./tidyhq/mock/seed";

vi.mock("./tidyhq/acceptsCheckIn", () => ({
  acceptsCheckIn: vi.fn(() => true),
}));

const NOW = new Date("2026-10-12T18:00:00Z");
const client = () => new MockTidyClient(createSeed(NOW), () => NOW);
const ask = { eventId: "ev_tonight", contactId: "c_marcus", now: NOW };

describe("acceptsCheckIn, everywhere it applies", () => {
  it("an accepted event has a QR code, a running staff page, and a ready member", async () => {
    vi.mocked(acceptsCheckIn).mockReturnValue(true);
    expect(
      (await getAdminEventPage(client(), "ev_tonight", { now: NOW }))!.qr.kind,
    ).toBe("qr");
    expect(await staffEventState(client(), "ev_tonight", NOW)).toMatchObject({
      status: "running",
    });
    expect(await assessCheckIn(client(), ask)).toMatchObject({
      status: "ready",
    });
  });

  it("a refused event has no QR code, an ended staff page, and a refused member: all for the same reason", async () => {
    vi.mocked(acceptsCheckIn).mockReturnValue(false);
    const page = await getAdminEventPage(client(), "ev_tonight", { now: NOW });
    expect(page!.qr).toEqual({ kind: "none", reason: "not_accepted" });
    expect(page!.checkin).toBe("unavailable");
    expect(await staffEventState(client(), "ev_tonight", NOW)).toMatchObject({
      status: "ended",
      reason: "not_accepted",
    });
    expect(await assessCheckIn(client(), ask)).toMatchObject({
      status: "event_unavailable",
    });
  });

  it("refuses only the events the rule names", async () => {
    vi.mocked(acceptsCheckIn).mockImplementation((e) => e.id !== "ev_tonight");
    const other = await getAdminEventPage(client(), "ev_leather_brunch", {
      now: NOW,
    });
    expect(other!.qr.kind).toBe("qr");
    expect(
      await assessCheckIn(client(), { ...ask, eventId: "ev_tonight" }),
    ).toMatchObject({ status: "event_unavailable" });
  });
});
