import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPointsPatch, getTidyServices, readPoints } from "@/lib/tidyhq";
import { POST } from "./route";

describe("POST /mock-tidyhq/reset", () => {
  beforeEach(() => {
    vi.stubEnv("TIDYHQ_MODE", "mock");
    vi.stubEnv("E2E", "1");
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

  it.each(["", "0", "true"])(
    "404s in mock mode unless E2E is exactly 1 (E2E=%j), and changes nothing",
    async (value) => {
      vi.stubEnv("E2E", value);
      const tidy = getTidyServices();
      await tidy.client.addContactToGroup("grp_social_night", "c_dante");

      const response = await POST();
      expect(response.status).toBe(404);
      expect(
        (await tidy.client.listGroupContacts("grp_social_night")).map(
          (c) => c.id,
        ),
      ).toContain("c_dante");
    },
  );

  it("404s outside mock mode, without building the live services", async () => {
    vi.stubEnv("TIDYHQ_MODE", "live");
    const response = await POST();
    expect(response.status).toBe(404);
    expect((globalThis as { __tidy?: unknown }).__tidy).toBeUndefined();
  });
});
