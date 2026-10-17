import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import AuthorizePage from "./page";

describe("the fake TidyHQ sign-in page", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete (globalThis as { __tidy?: unknown }).__tidy;
  });

  it("is not found in live mode, without building the live services", async () => {
    vi.stubEnv("TIDYHQ_MODE", "live");
    await expect(AuthorizePage({} as never)).rejects.toThrow("NEXT_NOT_FOUND");
    expect((globalThis as { __tidy?: unknown }).__tidy).toBeUndefined();
  });
});
