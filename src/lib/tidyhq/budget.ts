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

/**
 * Time held back for a staff check-in's note. The note is the record of who
 * checked a member in and nothing brings it back later, while the colors add
 * heals itself at the member's next check-in; so the colors steps get what is
 * left after this, and the note gets the rest.
 */
export const NOTE_RESERVE_MS = 4_000;

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

/** Whether there is a budget and it has too little left to start anything. */
export function budgetSpent(): boolean {
  const left = remainingMs();
  return left !== null && left <= MIN_ATTEMPT_MS;
}
