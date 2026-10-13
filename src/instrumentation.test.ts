import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { register } from "./instrumentation";

describe("register (server startup checks)", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("TIDYHQ_MODE", "mock");
    vi.stubEnv("APP_ORIGIN", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete (globalThis as { __tidy?: unknown }).__tidy;
  });

  it("starts in mock mode in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await expect(register()).resolves.toBeUndefined();
  });

  it("refuses to start in a mode that isn't implemented yet", async () => {
    vi.stubEnv("TIDYHQ_MODE", "live");
    await expect(register()).rejects.toThrow(/not implemented/);
  });

  it("refuses to start in production without TIDYHQ_MODE", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TIDYHQ_MODE", "");
    vi.stubEnv("APP_ORIGIN", "https://checkin.example.org");
    await expect(register()).rejects.toThrow(/TIDYHQ_MODE must be set/);
  });

  it("refuses to start in production without APP_ORIGIN", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(register()).rejects.toThrow(/APP_ORIGIN must be set/);
  });

  it("starts in production with both set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ORIGIN", "https://checkin.example.org");
    await expect(register()).resolves.toBeUndefined();
  });
});
