import type { TidyClient } from "./client";
import { MockTidyClient } from "./mock/MockTidyClient";

export type { TidyClient, ListEventsOptions } from "./client";
export { TidyError } from "./errors";
export { resolveEventGroup } from "./eventGroups";
export { buildPointsPatch, readPoints, POINTS_FIELD_ID } from "./customFields";
export type * from "./types";

export type TidyMode = "mock" | "live";

export function parseTidyMode(value: string | undefined): TidyMode {
  const mode = value?.trim() || "mock";
  if (mode === "mock" || mode === "live") return mode;
  throw new Error(`TIDYHQ_MODE must be "mock" or "live", got "${mode}"`);
}

export function createTidyClient(mode: TidyMode): TidyClient {
  if (mode === "live") {
    throw new Error("TIDYHQ_MODE=live is not implemented yet (HttpTidyClient)");
  }
  return new MockTidyClient();
}

// Cached on globalThis so Next.js dev hot reloads don't reset the mock's state.
const cache = globalThis as typeof globalThis & { __tidyClient?: TidyClient };

/** The app-wide TidyHQ client, chosen by `TIDYHQ_MODE` (default `mock`). */
export function getTidyClient(): TidyClient {
  cache.__tidyClient ??= createTidyClient(
    parseTidyMode(process.env.TIDYHQ_MODE),
  );
  return cache.__tidyClient;
}
