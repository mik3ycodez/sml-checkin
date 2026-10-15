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

  it("round-trips a balance-due notice on an awarded point", () => {
    const outcome = {
      kind: "awarded",
      points: 1,
      membershipNotice: { kind: "balance_due" },
    } as const;
    const value = encodeTapNotice({ ...FOR_DANTE, outcome });
    expect(readTapNotice(value, FOR_DANTE)).toEqual(outcome);
  });

  it("round-trips a grace notice, working the renew-by date out again", () => {
    const outcome = {
      kind: "awarded",
      points: 1,
      membershipNotice: {
        kind: "grace",
        expiredOn: "2026-09-22",
        renewBy: "2026-11-21",
      },
    } as const;
    const value = encodeTapNotice({ ...FOR_DANTE, outcome });
    expect(value).not.toContain("2026-11-21");
    expect(readTapNotice(value, FOR_DANTE)).toEqual(outcome);
  });

  it.each([
    "m=grace",
    "m=grace&x=tomorrow",
    "m=grace&x=2026-13-45",
    "m=surprise",
  ])("drops a malformed membership notice (%s) but keeps the points", (m) => {
    const value = `e=ev_tonight&c=c_dante&o=awarded&p=1&${m}`;
    expect(readTapNotice(value, FOR_DANTE)).toEqual({
      kind: "awarded",
      points: 1,
    });
  });

  it("round-trips a notice on a point that didn't save", () => {
    const outcome = {
      kind: "point_not_saved",
      membershipNotice: { kind: "balance_due" },
    } as const;
    const value = encodeTapNotice({ ...FOR_DANTE, outcome });
    expect(readTapNotice(value, FOR_DANTE)).toEqual(outcome);
  });

  it("leaves the notice out, rather than null, when there isn't one", () => {
    const value = encodeTapNotice({
      ...FOR_DANTE,
      outcome: { kind: "awarded", points: 1 },
    });
    expect(readTapNotice(value, FOR_DANTE)).toStrictEqual({
      kind: "awarded",
      points: 1,
    });
  });

  it("round-trips the rewards this point reached, with the standing", () => {
    const outcome = {
      kind: "awarded",
      points: 1,
      qualified: [{ rewardId: "club_colors", standing: "balance_due" }],
    } as const;
    const value = encodeTapNotice({ ...FOR_DANTE, outcome });
    expect(readTapNotice(value, FOR_DANTE)).toEqual(outcome);
  });

  it.each(["club_colors:vip", "hat:current", "club_colors", ""])(
    "drops an unknown reward entry %j",
    (q) => {
      const params = new URLSearchParams(
        encodeTapNotice({
          ...FOR_DANTE,
          outcome: { kind: "awarded", points: 1 },
        }),
      );
      params.set("q", q);
      expect(readTapNotice(params.toString(), FOR_DANTE)).toEqual({
        kind: "awarded",
        points: 1,
      });
    },
  );

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
