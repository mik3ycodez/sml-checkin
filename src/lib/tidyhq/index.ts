import type { TidyClient } from "./client";
import { MockTidyClient } from "./mock/MockTidyClient";
import { MockTidyOAuth } from "./mock/MockTidyOAuth";
import type { TidyOAuth } from "./oauth";

export type { TidyClient, ListEventsOptions } from "./client";
export type { TidyOAuth } from "./oauth";
export { TidyError } from "./errors";
export { resolveEventGroup } from "./eventGroups";
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

/** Everything that talks to TidyHQ, for one mode. The only mode switch. */
export function createTidyServices(mode: TidyMode): TidyServices {
  if (mode === "live") {
    throw new Error(
      "TIDYHQ_MODE=live is not implemented yet (HttpTidyClient, live OAuth)",
    );
  }
  return {
    mode: "mock",
    client: new MockTidyClient(),
    oauth: new MockTidyOAuth(process.env.TIDYHQ_CLIENT_ID || "mock-client-id"),
  };
}

export function createTidyClient(mode: TidyMode): TidyClient {
  return createTidyServices(mode).client;
}

// Cached on globalThis so Next.js dev hot reloads don't reset the mock's
// state, and so codes the fake sign-in page issues are there at the callback.
const cache = globalThis as typeof globalThis & { __tidy?: TidyServices };

/** The app-wide services, created once for this server's `TIDYHQ_MODE`. */
export function getTidyServices(): TidyServices {
  cache.__tidy ??= createTidyServices(getTidyMode());
  return cache.__tidy;
}

/** The app-wide TidyHQ client, chosen by `TIDYHQ_MODE` (default `mock`). */
export function getTidyClient(): TidyClient {
  return getTidyServices().client;
}

/** The app-wide TidyHQ sign-in, chosen by `TIDYHQ_MODE` (default `mock`). */
export function getTidyOAuth(): TidyOAuth {
  return getTidyServices().oauth;
}
