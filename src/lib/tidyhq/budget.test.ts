import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHECKIN_BUDGET_MS,
  CRITICAL_WRITES_MS,
  MIN_ATTEMPT_MS,
  remainingMs,
  REQUEST_TIMEOUT_MS,
  requestTimeoutMs,
  withBudget,
  withReserve,
} from "./budget";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("withBudget", () => {
  it("is no budget at all outside of it", () => {
    expect(remainingMs()).toBeNull();
  });

  it("counts down from its start, across awaits", async () => {
    await withBudget(10_000, async () => {
      expect(remainingMs()).toBe(10_000);
      await Promise.resolve();
      vi.advanceTimersByTime(2_500);
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      expect(remainingMs()).toBe(7_500);
    });
    expect(remainingMs()).toBeNull();
  });

  it("never reports less than zero", async () => {
    await withBudget(1_000, async () => {
      vi.advanceTimersByTime(5_000);
      expect(remainingMs()).toBe(0);
    });
  });

  it("returns what the work returns and passes its errors on", async () => {
    await expect(withBudget(1_000, async () => 42)).resolves.toBe(42);
    await expect(
      withBudget(1_000, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });

  it("lets a nested budget shorten the time but never extend it", async () => {
    await withBudget(10_000, async () => {
      await withBudget(3_000, async () => {
        expect(remainingMs()).toBe(3_000);
      });
      await withBudget(60_000, async () => {
        expect(remainingMs()).toBe(10_000);
      });
      expect(remainingMs()).toBe(10_000);
    });
  });

  it("is seen by another copy of the module (Next bundles routes separately)", async () => {
    vi.resetModules();
    const other = await import("./budget");
    await withBudget(5_000, async () => {
      expect(other.remainingMs()).toBe(5_000);
    });
  });

  it("fits inside the 30 second route limit with room to render", () => {
    expect(CHECKIN_BUDGET_MS).toBeLessThanOrEqual(25_000);
    expect(MIN_ATTEMPT_MS).toBeGreaterThan(0);
  });
});

describe("withReserve", () => {
  it("ends the work early, keeping time back for what comes after", async () => {
    await withBudget(10_000, async () => {
      await withReserve(4_000, async () => {
        expect(remainingMs()).toBe(6_000);
        vi.advanceTimersByTime(7_000);
        expect(remainingMs()).toBe(0);
      });
      // The whole budget, not the shortened one: 3 s are left.
      expect(remainingMs()).toBe(3_000);
    });
  });

  it("just runs the work when there is no budget", async () => {
    await withReserve(4_000, async () => {
      expect(remainingMs()).toBeNull();
    });
  });
});

describe("requestTimeoutMs", () => {
  it("is the usual timeout when there is no budget", () => {
    expect(requestTimeoutMs(8_000)).toBe(8_000);
    expect(requestTimeoutMs(8_000, { write: true })).toBe(8_000);
  });

  it("cuts a read down to the time left", async () => {
    await withBudget(3_000, async () => {
      expect(requestTimeoutMs(8_000)).toBe(3_000);
    });
  });

  it("is null (out of time) with no more than the minimum attempt left", async () => {
    await withBudget(MIN_ATTEMPT_MS, async () => {
      expect(requestTimeoutMs(8_000)).toBeNull();
      expect(requestTimeoutMs(8_000, { write: true })).toBeNull();
    });
  });

  it("never shortens a write: full timeout or null, never in between", async () => {
    await withBudget(7_999, async () => {
      expect(requestTimeoutMs(8_000, { write: true })).toBeNull();
    });
    await withBudget(8_000, async () => {
      expect(requestTimeoutMs(8_000, { write: true })).toBe(8_000);
    });
    await withBudget(20_000, async () => {
      expect(requestTimeoutMs(8_000, { write: true })).toBe(8_000);
    });
  });
});

describe("the two critical writes", () => {
  it("are sized from the request timeout, and fit inside the check-in budget", () => {
    expect(CRITICAL_WRITES_MS).toBe(2 * REQUEST_TIMEOUT_MS);
    expect(CRITICAL_WRITES_MS).toBeLessThan(CHECKIN_BUDGET_MS);
  });
});
