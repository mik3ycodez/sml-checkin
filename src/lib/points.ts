// The one place point values live. Rules may expand later, so change them
// here rather than at call sites.

export type CheckInMethod = "self" | "staff";

export const POINTS_PER_CHECKIN = 1;

export interface Reward {
  id: "club_colors";
  /** Lower case, for use mid-sentence. */
  name: string;
  pointsRequired: number;
}

/** Rewards members earn by points. Only club colors for now. */
export const REWARDS: readonly Reward[] = [
  { id: "club_colors", name: "club colors", pointsRequired: 18 },
];
