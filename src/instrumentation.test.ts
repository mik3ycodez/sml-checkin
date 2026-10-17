import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { register } from "./instrumentation";

describe("register (server startup checks)", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("TIDYHQ_MODE", "mock");
    vi.stubEnv("APP_ORIGIN", "");
    vi.stubEnv("DEMO_MODE", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete (globalThis as { __tidy?: unknown }).__tidy;
  });

  it("starts in mock mode in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await expect(register()).resolves.toBeUndefined();
  });

  it("refuses to start in live mode with settings missing, naming them", async () => {
    vi.stubEnv("TIDYHQ_MODE", "live");
    const error = await register().catch((e: unknown) => e as Error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/TIDYHQ_CLIENT_SECRET/);
  });

  it("starts in live mode with a complete configuration", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TIDYHQ_MODE", "live");
    vi.stubEnv("APP_ORIGIN", "https://checkin.sml-test.invalid");
    vi.stubEnv("TIDYHQ_CLIENT_ID", "cid_9f2c41d7aa");
    vi.stubEnv("TIDYHQ_CLIENT_SECRET", "cs_live_2b7e90aa11");
    vi.stubEnv("TIDYHQ_ADMIN_TOKEN", "at_live_77c0ffee12");
    vi.stubEnv("SESSION_SECRET", "k3Jv9Qe2mXz0Lw8RtYb5Nc1Hd7Fa4GuS6pIoVxZ");
    await expect(register()).resolves.toBeUndefined();
  });

  it("refuses to start in production on mock data unless DEMO_MODE=on", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ORIGIN", "https://checkin.sml-test.invalid");
    await expect(register()).rejects.toThrow(/DEMO_MODE/);
    vi.stubEnv("DEMO_MODE", "on");
    await expect(register()).resolves.toBeUndefined();
  });

  it("refuses to start in production without TIDYHQ_MODE", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TIDYHQ_MODE", "");
    vi.stubEnv("APP_ORIGIN", "https://checkin.example.org");
    await expect(register()).rejects.toThrow(/TIDYHQ_MODE must be set/);
  });

  it("refuses to start in production without APP_ORIGIN", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMO_MODE", "on");
    await expect(register()).rejects.toThrow(/APP_ORIGIN must be set/);
  });

  it("refuses to start in production with a plain-http APP_ORIGIN", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMO_MODE", "on");
    vi.stubEnv("APP_ORIGIN", "http://checkin.example.org");
    await expect(register()).rejects.toThrow(/APP_ORIGIN must use https/);
  });

  it("starts in production with an http localhost APP_ORIGIN", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMO_MODE", "on");
    vi.stubEnv("APP_ORIGIN", "http://localhost:3100");
    await expect(register()).resolves.toBeUndefined();
  });

  it("refuses to start with a TIDYHQ_DOMAIN_PREFIX that isn't a subdomain", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TIDYHQ_DOMAIN_PREFIX", "sml.tidyhq.com");
    await expect(register()).rejects.toThrow(/TIDYHQ_DOMAIN_PREFIX/);
  });

  it("starts in production with both set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMO_MODE", "on");
    vi.stubEnv("APP_ORIGIN", "https://checkin.example.org");
    await expect(register()).resolves.toBeUndefined();
  });
});
