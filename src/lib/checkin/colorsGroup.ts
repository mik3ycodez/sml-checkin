import { getTidyMode, type TidyMode } from "../tidyhq";
import { groupFromSetting, type GroupSetting } from "../auth/groupAccess";
import { MOCK_COLORS_GROUP_ID } from "../tidyhq/mock/seed";

/**
 * The "App Color Eligible" group's id from `COLORS_GROUP_ID`, or why there
 * isn't a usable one. Same rules as `adminGroup` and `helperGroup`: mock mode
 * falls back to the seed's group when unset; live mode has no default. A
 * missing value never blocks check-in or startup: the colors add is skipped.
 */
export function colorsGroup(
  env: { COLORS_GROUP_ID?: string },
  mode: TidyMode,
): GroupSetting {
  return groupFromSetting(env.COLORS_GROUP_ID, MOCK_COLORS_GROUP_ID, mode);
}

/** `colorsGroup` for the running app: the environment and the current mode. */
export function colorsGroupFromEnv(): GroupSetting {
  return colorsGroup(
    { COLORS_GROUP_ID: process.env.COLORS_GROUP_ID },
    getTidyMode(),
  );
}
