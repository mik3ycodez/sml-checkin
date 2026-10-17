import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CHECKIN_BUDGET_MS,
  ROUTE_MAX_DURATION_SECONDS,
} from "@/lib/tidyhq/budget";

// A check-in's time budget only helps if the route's limit is the one it was
// sized for. `maxDuration` must be a literal in the page file for Next.js to
// read it, so this test reads the source, and checks it against the budget.
// Server actions take the limit of the page that holds their form.

const PAGES = [
  "checkin/[eventId]/page.tsx",
  "admin/events/[eventId]/checkin/page.tsx",
];

describe.each(PAGES)("%s", (page) => {
  const source = readFileSync(join(__dirname, page), "utf8");

  it("sets maxDuration to the route limit the budget is sized for", () => {
    const match = /^export const maxDuration = (\d+);?$/m.exec(source);
    expect(match, "export const maxDuration = <seconds>").not.toBeNull();
    expect(Number(match![1])).toBe(ROUTE_MAX_DURATION_SECONDS);
  });
});

describe("the check-in budget", () => {
  it("is shorter than the route limit, leaving time to answer", () => {
    expect(CHECKIN_BUDGET_MS).toBeLessThan(ROUTE_MAX_DURATION_SECONDS * 1000);
    expect(
      ROUTE_MAX_DURATION_SECONDS * 1000 - CHECKIN_BUDGET_MS,
    ).toBeGreaterThanOrEqual(5000);
  });
});
