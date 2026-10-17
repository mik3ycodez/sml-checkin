import { isDemoMode } from "./demoMode";
import { parseTidyMode } from "./tidyhq";
import { sessionSecretIssue, type Env } from "./tidyhq/liveConfig";

// The startup check, called from instrumentation.ts. A bad deploy should fail
// when the server starts, not on a member's first tap. Messages name settings
// and never print their values.

/**
 * Refuses to start on a configuration that would be unsafe or silently wrong:
 *  - mock mode in production, where anyone could sign in as any seed member,
 *    unless `DEMO_MODE=on` says that is the point (every page then carries a
 *    "Demo data" banner);
 *  - `DEMO_MODE=on` with live data, whose banner would be a lie;
 *  - in production, a `SESSION_SECRET` that is missing, too short or a
 *    placeholder, demo included: every page reads the session, and a known
 *    key would let anyone forge one.
 * Anything outside production may run mock mode as before.
 *
 * It does not check the live settings themselves: `createTidyServices`
 * (called right after, through `getTidyServices`) does, once, and also covers
 * `SESSION_SECRET` in live mode, so one message lists everything wrong.
 */
export function checkStartupConfig(env: Env = process.env): void {
  const mode = parseTidyMode(env.TIDYHQ_MODE, env.NODE_ENV);

  const demo = env.DEMO_MODE?.trim() ?? "";
  if (demo !== "" && demo !== "on" && demo !== "off") {
    throw new Error('DEMO_MODE must be "on", "off" or unset.');
  }

  if (mode === "live") {
    if (isDemoMode(env)) {
      throw new Error(
        "DEMO_MODE=on cannot be used with TIDYHQ_MODE=live: the Demo data banner would be on real members.",
      );
    }
    if (!env.ADMIN_GROUP_ID?.trim()) {
      console.warn(
        "ADMIN_GROUP_ID is not set: nobody will be able to use the admin pages until it is.",
      );
    }
    return;
  }
  if (env.NODE_ENV === "production") {
    if (!isDemoMode(env)) {
      throw new Error(
        "TIDYHQ_MODE=mock is refused in production (anyone could sign in as any seed member). Set TIDYHQ_MODE=live, or DEMO_MODE=on for a demo site.",
      );
    }
    const problem = sessionSecretIssue(env);
    if (problem) throw new Error(`Cannot start in production: ${problem}.`);
  }
}
