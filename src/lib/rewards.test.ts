import { describe, expect, it } from "vitest";
import type { MembershipStanding } from "./membership";
import { REWARDS } from "./points";
import {
  newlyQualified,
  rewardMessage,
  rewardStanding,
  rewardStatus,
  type RewardEntry,
} from "./rewards";
import type { Membership } from "./tidyhq";

const [COLORS] = REWARDS;

const MEMBERSHIP = {} as Membership;

describe("REWARDS", () => {
  it("has club colors at 18 points", () => {
    expect(COLORS).toEqual({
      id: "club_colors",
      name: "club colors",
      pointsRequired: 18,
    });
  });
});

describe("rewardStatus", () => {
  it.each([
    [0, 18],
    [1, 17],
    [17, 1],
  ])("is progress at %i points, %i to go", (points, remaining) => {
    expect(rewardStatus(COLORS, points, false)).toEqual({
      kind: "progress",
      remaining,
    });
  });

  it.each([18, 30])("is qualified at %i points, not issued", (points) => {
    expect(rewardStatus(COLORS, points, false)).toEqual({ kind: "qualified" });
  });

  it.each([25, 10, 0])(
    "is issued at %i points, whatever the total",
    (points) => {
      expect(rewardStatus(COLORS, points, true)).toEqual({ kind: "issued" });
    },
  );

  it("is unreadable (null) when the issued field is unreadable", () => {
    expect(rewardStatus(COLORS, 30, null)).toBeNull();
    expect(rewardStatus(COLORS, 3, null)).toBeNull();
  });

  it("is unreadable (null) when points are unreadable and colors aren't issued", () => {
    expect(rewardStatus(COLORS, null, false)).toBeNull();
  });

  it("is issued even when points are unreadable", () => {
    expect(rewardStatus(COLORS, null, true)).toEqual({ kind: "issued" });
  });
});

describe("rewardStanding", () => {
  const cases: [MembershipStanding, string][] = [
    [
      {
        kind: "current",
        membership: MEMBERSHIP,
        endsOn: "2027-01-01",
        balanceDue: false,
      },
      "current",
    ],
    [
      {
        kind: "current",
        membership: MEMBERSHIP,
        endsOn: null,
        balanceDue: false,
      },
      "current",
    ],
    [
      {
        kind: "current",
        membership: MEMBERSHIP,
        endsOn: "2027-01-01",
        balanceDue: true,
      },
      "balance_due",
    ],
    [
      {
        kind: "grace",
        membership: MEMBERSHIP,
        endsOn: "2026-09-01",
        renewBy: "2026-10-31",
      },
      "grace",
    ],
    [
      { kind: "lapsed", membership: MEMBERSHIP, endsOn: "2026-01-01" },
      "lapsed",
    ],
    [{ kind: "none" }, "lapsed"],
  ];
  it.each(cases)("maps %j to %s", (standing, expected) => {
    expect(rewardStanding(standing)).toBe(expected);
  });
});

describe("rewardMessage", () => {
  const qualified = { kind: "qualified" } as const;

  it("tells a current member a Board member will connect with them", () => {
    expect(rewardMessage(COLORS, qualified, "current")).toBe(
      "You qualify for club colors! A Board member will connect with you to distribute your club colors.",
    );
  });

  it.each(["grace", "lapsed"] as const)(
    "tells a %s member to renew first",
    (standing) => {
      expect(rewardMessage(COLORS, qualified, standing)).toBe(
        "You qualify for club colors. You will need to renew before receiving club colors.",
      );
    },
  );

  it("tells a member with a balance due to complete payment first", () => {
    expect(rewardMessage(COLORS, qualified, "balance_due")).toBe(
      "You qualify for club colors. You will need to complete payment before receiving club colors.",
    );
  });

  it("counts down the points to go, in any standing", () => {
    for (const standing of [
      "current",
      "balance_due",
      "grace",
      "lapsed",
    ] as const) {
      expect(
        rewardMessage(COLORS, { kind: "progress", remaining: 5 }, standing),
      ).toBe("5 more points until you qualify for club colors.");
    }
  });

  it("uses the singular for the last point", () => {
    expect(
      rewardMessage(COLORS, { kind: "progress", remaining: 1 }, "current"),
    ).toBe("1 more point until you qualify for club colors.");
  });

  it("says colors are issued, whatever the standing", () => {
    for (const standing of [
      "current",
      "balance_due",
      "grace",
      "lapsed",
    ] as const) {
      expect(rewardMessage(COLORS, { kind: "issued" }, standing)).toBe(
        "Club colors issued.",
      );
    }
  });
});

describe("newlyQualified", () => {
  const entry = (status: RewardEntry["status"]): RewardEntry => ({
    reward: COLORS,
    status,
  });

  it("returns the reward this check-in's point just earned", () => {
    const entries = [entry({ kind: "qualified" })];
    expect(newlyQualified(entries, { total: 18, awarded: 1 })).toEqual(entries);
  });

  it("returns nothing when they already qualified before this check-in", () => {
    const entries = [entry({ kind: "qualified" })];
    expect(newlyQualified(entries, { total: 19, awarded: 1 })).toEqual([]);
  });

  it("returns nothing while still short", () => {
    const entries = [entry({ kind: "progress", remaining: 2 })];
    expect(newlyQualified(entries, { total: 16, awarded: 1 })).toEqual([]);
  });

  it("returns nothing when colors are already issued", () => {
    const entries = [entry({ kind: "issued" })];
    expect(newlyQualified(entries, { total: 18, awarded: 1 })).toEqual([]);
  });
});
