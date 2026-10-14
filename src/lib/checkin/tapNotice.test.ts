import { describe, expect, it } from "vitest";
import { encodeTapNotice, readTapNotice } from "./tapNotice";

const FOR_DANTE = { eventId: "ev_tonight", contactId: "c_dante" };

describe("tap notice", () => {
  it("round-trips the points awarded", () => {
    const value = encodeTapNotice({
      ...FOR_DANTE,
      outcome: { kind: "awarded", points: 1 },
    });
    expect(readTapNotice(value, FOR_DANTE)).toEqual({
      kind: "awarded",
      points: 1,
    });
  });

  it("round-trips a repeat tap", () => {
    const value = encodeTapNotice({
      ...FOR_DANTE,
      outcome: { kind: "repeat" },
    });
    expect(readTapNotice(value, FOR_DANTE)).toEqual({ kind: "repeat" });
  });

  it("round-trips a point that didn't save", () => {
    const value = encodeTapNotice({
      ...FOR_DANTE,
      outcome: { kind: "point_not_saved" },
    });
    expect(readTapNotice(value, FOR_DANTE)).toEqual({
      kind: "point_not_saved",
    });
  });

  it("is ignored for another member on the same phone", () => {
    const value = encodeTapNotice({
      ...FOR_DANTE,
      outcome: { kind: "awarded", points: 1 },
    });
    expect(
      readTapNotice(value, { eventId: "ev_tonight", contactId: "c_lee" }),
    ).toBeNull();
  });

  it("is ignored for another event", () => {
    const value = encodeTapNotice({
      ...FOR_DANTE,
      outcome: { kind: "repeat" },
    });
    expect(
      readTapNotice(value, { eventId: "ev_pub_night", contactId: "c_dante" }),
    ).toBeNull();
  });

  it("keeps ids with separators intact", () => {
    const ids = { eventId: "a&b=c", contactId: "x&e=ev_tonight" };
    const value = encodeTapNotice({
      ...ids,
      outcome: { kind: "awarded", points: 2 },
    });
    expect(readTapNotice(value, ids)).toEqual({ kind: "awarded", points: 2 });
    expect(
      readTapNotice(value, { eventId: "ev_tonight", contactId: "x" }),
    ).toBeNull();
  });

  it.each([
    undefined,
    "",
    "garbage",
    "e=ev_tonight&c=c_dante",
    "e=ev_tonight&c=c_dante&o=surprise",
    "e=ev_tonight&c=c_dante&o=awarded",
    "e=ev_tonight&c=c_dante&o=awarded&p=",
    "e=ev_tonight&c=c_dante&o=awarded&p=-1",
    "e=ev_tonight&c=c_dante&o=awarded&p=1.5",
    "e=ev_tonight&c=c_dante&o=awarded&p=0",
  ])("reads %j as no notice", (value) => {
    expect(readTapNotice(value, FOR_DANTE)).toBeNull();
  });
});
