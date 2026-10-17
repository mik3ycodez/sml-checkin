import { AsyncLocalStorage } from "node:async_hooks";

// One overall time budget per check-in, so the total can never pass the
// route's 30 second limit. PR 2's per-request timeout (8 s, plus one retry,
// plus paging) can otherwise add up to more than that. The budget is a single
// deadline shared by every TidyHQ call made inside `withBudget`: the request
// layer reads it, so no call needs it passed in.

/**
 * The limit `maxDuration` sets on the check-in pages (a literal there, since
 * Next.js reads it from the source; `maxDuration.test.ts` keeps them equal).
 */
export const ROUTE_MAX_DURATION_SECONDS = 30;

/** The whole check-in, leaving the rest of the route's time to render and redirect. */
export const CHECKIN_BUDGET_MS = 24_000;

/** Less than this left is not worth starting a request for. */
export const MIN_ATTEMPT_MS = 500;

/** Per request, so our server answers before a member's phone gives up. */
export const REQUEST_TIMEOUT_MS = 8000;

/**
 * What the two writes a check-in cannot do without (the group add and the
 * points write) need, each at its full timeout. A write is never given less:
 * one that reaches TidyHQ but is aborted on our side would be reported as
 * failed, and a retry or a Board member's "fix" would then double-award or
 * lose the point. So `checkIn` makes sure this much is left before it writes
 * anything. With the 24 s budget that leaves 8 s for all the reads before.
 */
export const CRITICAL_WRITES_MS = 2 * REQUEST_TIMEOUT_MS;

/**
 * Time held back for a staff check-in's note, which is a write and so needs a
 * full request's time or isn't started. The note is the record of who checked
 * a member in and nothing brings it back later, while the colors add heals
 * itself at the member's next check-in; so the colors steps get what is left
 * after this, and the note gets the rest.
 */
export const NOTE_RESERVE_MS = REQUEST_TIMEOUT_MS;

type Budget = { deadline: number };

// Kept on globalThis, like the cached client: Next.js bundles routes and pages
// separately, each with its own copy of this module, and the client that reads
// the deadline may come from another copy than the code that set it.
const shared = globalThis as typeof globalThis & {
  __tidyBudget?: AsyncLocalStorage<Budget>;
};
const storage = (shared.__tidyBudget ??= new AsyncLocalStorage<Budget>());

/**
 * Runs `run` with at most `ms` to finish its TidyHQ calls. A budget inside
 * another can shorten the time, never extend it.
 */
export function withBudget<T>(ms: number, run: () => Promise<T>): Promise<T> {
  const own = Date.now() + ms;
  const parent = storage.getStore();
  const deadline = parent ? Math.min(parent.deadline, own) : own;
  return storage.run({ deadline }, run);
}

/**
 * Runs `run` ending `reserveMs` before the current deadline, so what comes
 * after it still has that long. Without a budget, just runs it.
 */
export function withReserve<T>(
  reserveMs: number,
  run: () => Promise<T>,
): Promise<T> {
  const parent = storage.getStore();
  if (!parent) return run();
  return storage.run({ deadline: parent.deadline - reserveMs }, run);
}

/** Milliseconds left in the current budget (never below 0), or null if none. */
export function remainingMs(): number | null {
  const budget = storage.getStore();
  return budget ? Math.max(0, budget.deadline - Date.now()) : null;
}

/**
 * Whether there is a budget and it has too little left to start a request: for
 * a write (`write: true`), less than a full request's time.
 */
export function budgetSpent({
  write = false,
}: { write?: boolean } = {}): boolean {
  return requestTimeoutMs(REQUEST_TIMEOUT_MS, { write }) === null;
}

/**
 * The one cut-off rule for a request: how long it may take, or null when it
 * must not be started. Outside a budget, `defaultMs`. Inside one, null with
 * `MIN_ATTEMPT_MS` or less left. A read is then cut down to the time left. A
 * write (`write: true`) is never shortened: it gets `defaultMs` in full or is
 * not sent, since a write the server applied but we aborted can't be told from
 * one that failed.
 */
export function requestTimeoutMs(
  defaultMs: number,
  { write = false }: { write?: boolean } = {},
): number | null {
  const left = remainingMs();
  if (left === null) return defaultMs;
  if (left <= MIN_ATTEMPT_MS) return null;
  if (write && left < defaultMs) return null;
  return Math.min(defaultMs, left);
}
