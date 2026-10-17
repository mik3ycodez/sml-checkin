import { describe, expect, it, vi } from "vitest";
import { CHECKIN_BUDGET_MS, remainingMs } from "@/lib/tidyhq/budget";
import { TidyError } from "@/lib/tidyhq/errors";

const left: Record<string, number | null> = {};
vi.mock("../../../../requireVolunteer", () => ({
  requireVolunteer: async () => {
    left.access = remainingMs();
    return { role: "volunteer", name: "Pat Rivera", contactId: "c_pat" };
  },
}));
vi.mock("@/lib/tidyhq", () => ({ getTidyClient: () => ({}) }));
vi.mock("@/lib/checkin/staffEvent", () => ({
  staffEventState: async () => {
    left.event = remainingMs();
    throw new TidyError(504, "out of time");
  },
}));

import StaffCheckInPage from "./page";

describe("the staff check-in page", () => {
  it("renders inside a time budget, access check included, and a slow TidyHQ shows its own notice", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const element = await StaffCheckInPage({
      params: Promise.resolve({ eventId: "ev_tonight" }),
      searchParams: Promise.resolve({}),
    } as never);
    for (const name of ["access", "event"]) {
      expect(left[name], name).not.toBeNull();
      expect(left[name], name).toBeLessThanOrEqual(CHECKIN_BUDGET_MS);
    }
    expect(JSON.stringify(element)).toContain("temporarily unavailable");
  });
});
