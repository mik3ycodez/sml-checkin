import { liveConfig, type Env } from "./tidyhq/liveConfig";
import { isDemoMode } from "./demoMode";
import { parseTidyMode } from "./tidyhq";

// The startup check, called from instrumentation.ts. A bad deploy should fail
// when the server starts, not on a member's first tap. Messages name settings
// and never print their values.

export { liveConfig, type LiveConfig } from "./tidyhq/liveConfig";

export { isDemoMode };

/**
 * Refuses to start on a configuration that would be unsafe or silently wrong:
 *  - live mode with a required setting missing, blank or still a placeholder;
 *  - mock mode in production, where anyone could sign in as any seed member,
 *    unless `DEMO_MODE=on` says that is the point (every page then carries a
 *    "Demo data" banner);
 *  - `DEMO_MODE=on` with live data, whose banner would be a lie.
 * Anything outside production may run mock mode as before.
 */
export function checkStartupConfig(env: Env = process.env): void {
  const mode = parseTidyMode(env.TIDYHQ_MODE, env.NODE_ENV);

  const demo = env.DEMO_MODE?.trim() ?? "";
  if (demo !== "" && demo !== "on" && demo !== "off") {
    throw new Error('DEMO_MODE must be "on" or left unset.');
  }

  if (mode === "live") {
    if (isDemoMode(env)) {
      throw new Error(
        "DEMO_MODE=on cannot be used with TIDYHQ_MODE=live: the Demo data banner would be on real members.",
      );
    }
    liveConfig(env);
    return;
  }
  if (env.NODE_ENV === "production" && !isDemoMode(env)) {
    throw new Error(
      "TIDYHQ_MODE=mock is refused in production (anyone could sign in as any seed member). Set TIDYHQ_MODE=live, or DEMO_MODE=on for a demo site.",
    );
  }
}
