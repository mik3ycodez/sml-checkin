import type { TidyClient } from "./client";
import { HttpTidyClient } from "./http/HttpTidyClient";
import { HttpTidyOAuth } from "./http/HttpTidyOAuth";
import { liveConfig, type Env } from "./liveConfig";
import { MockTidyClient } from "./mock/MockTidyClient";
import { MockTidyOAuth } from "./mock/MockTidyOAuth";
import type { TidyOAuth } from "./oauth";

export type { TidyClient, ListEventsOptions } from "./client";
export type { TidyOAuth } from "./oauth";
export { isTidyError, TidyError } from "./errors";
export { findEventGroup } from "./eventGroups";
export {
  getCheckinWindow,
  isCheckinOpen,
  type CheckinStatus,
  type CheckinWindow,
} from "./checkinWindow";
export { buildPointsPatch, readPoints, POINTS_FIELD_ID } from "./customFields";
export type * from "./types";

export type TidyMode = "mock" | "live";

/**
 * Parses `TIDYHQ_MODE`. Defaults to `mock` in development and tests, but a
 * production server must name its mode: falling back to mock there would let
 * anyone sign in as any seed member.
 */
export function parseTidyMode(
  value: string | undefined,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): TidyMode {
  const mode = value?.trim();
  if (!mode) {
    if (nodeEnv === "production") {
      throw new Error(
        'TIDYHQ_MODE must be set in production ("mock" or "live"); it never defaults to mock there.',
      );
    }
    return "mock";
  }
  if (mode === "mock" || mode === "live") return mode;
  throw new Error(`TIDYHQ_MODE must be "mock" or "live", got "${mode}"`);
}

/** The mode for this server, from the environment. */
export function getTidyMode(): TidyMode {
  return parseTidyMode(process.env.TIDYHQ_MODE);
}

/**
 * Everything that talks to TidyHQ. Tagged with its mode so mock-only pages
 * can check it: `instanceof` is unreliable here, because Next.js bundles
 * route handlers and pages separately, each with its own copy of the classes.
 */
export type TidyServices =
  | { mode: "mock"; client: MockTidyClient; oauth: MockTidyOAuth }
  | { mode: "live"; client: TidyClient; oauth: TidyOAuth };

/**
 * Everything that talks to TidyHQ, for one mode. The only mode switch. Live
 * mode reads its credentials from `env` and throws, naming the setting, if
 * one is missing or still a placeholder.
 */
export function createTidyServices(
  mode: TidyMode,
  env: Env = process.env,
): TidyServices {
  if (mode === "live") {
    const config = liveConfig(env);
    return {
      mode: "live",
      client: new HttpTidyClient({ adminToken: config.adminToken }),
      oauth: new HttpTidyOAuth({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        domainPrefix: config.domainPrefix,
      }),
    };
  }
  return {
    mode: "mock",
    client: new MockTidyClient(),
    oauth: new MockTidyOAuth(process.env.TIDYHQ_CLIENT_ID || "mock-client-id"),
  };
}

// Cached on globalThis so Next.js dev hot reloads don't reset the mock's
// state, and so codes the fake sign-in page issues are there at the callback.
const cache = globalThis as typeof globalThis & { __tidy?: TidyServices };

/**
 * The app-wide services, created once for this server's `TIDYHQ_MODE`
 * (mock by default outside production; production must set it).
 */
export function getTidyServices(): TidyServices {
  cache.__tidy ??= createTidyServices(getTidyMode());
  return cache.__tidy;
}

/** The app-wide TidyHQ client, chosen by `TIDYHQ_MODE`. */
export function getTidyClient(): TidyClient {
  return getTidyServices().client;
}

/** The app-wide TidyHQ sign-in, chosen by `TIDYHQ_MODE`. */
export function getTidyOAuth(): TidyOAuth {
  return getTidyServices().oauth;
}
