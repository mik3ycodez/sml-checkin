import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPointsPatch, getTidyServices, readPoints } from "@/lib/tidyhq";
import { POST } from "./route";

describe("POST /mock-tidyhq/reset", () => {
  beforeEach(() => {
    vi.stubEnv("TIDYHQ_MODE", "mock");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete (globalThis as { __tidy?: unknown }).__tidy;
  });

  it("restores seed totals and attendance", async () => {
    const tidy = getTidyServices();
    const before = await tidy.client.getContact("c_dante");
    await tidy.client.updateContact("c_dante", buildPointsPatch(7));
    await tidy.client.addContactToGroup("grp_social_night", "c_dante");

    const response = await POST();
    expect(response.status).toBe(204);

    const after = await tidy.client.getContact("c_dante");
    expect(readPoints(after)).toBe(readPoints(before));
    expect(await tidy.client.listGroupContacts("grp_social_night")).toEqual([]);
  });

  it("404s outside mock mode, without building the live services", async () => {
    vi.stubEnv("TIDYHQ_MODE", "live");
    const response = await POST();
    expect(response.status).toBe(404);
  });
});
