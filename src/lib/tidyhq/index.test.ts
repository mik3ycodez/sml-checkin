import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createTidyServices,
  getTidyClient,
  getTidyOAuth,
  parseTidyMode,
} from ".";
import { HttpTidyClient } from "./http/HttpTidyClient";
import { HttpTidyOAuth } from "./http/HttpTidyOAuth";
import { MockTidyClient } from "./mock/MockTidyClient";
import { MockTidyOAuth } from "./mock/MockTidyOAuth";

describe("parseTidyMode", () => {
  it("defaults to mock", () => {
    expect(parseTidyMode(undefined)).toBe("mock");
    expect(parseTidyMode("")).toBe("mock");
  });

  it("accepts mock and live", () => {
    expect(parseTidyMode("mock")).toBe("mock");
    expect(parseTidyMode("live")).toBe("live");
  });

  it("rejects anything else", () => {
    expect(() => parseTidyMode("prod")).toThrow(/TIDYHQ_MODE/);
  });

  describe("in production", () => {
    it.each([undefined, "", "  "])(
      "refuses to default to mock (%j)",
      (value) => {
        expect(() => parseTidyMode(value, "production")).toThrow(
          /TIDYHQ_MODE must be set/,
        );
      },
    );

    it("accepts an explicit mode", () => {
      expect(parseTidyMode("mock", "production")).toBe("mock");
      expect(parseTidyMode("live", "production")).toBe("live");
    });
  });

  it("still defaults to mock in development and tests", () => {
    expect(parseTidyMode(undefined, "development")).toBe("mock");
    expect(parseTidyMode(undefined, "test")).toBe("mock");
  });
});

describe("createTidyServices", () => {
  it("creates the mock client and mock OAuth together in mock mode", () => {
    const services = createTidyServices("mock");
    expect(services.mode).toBe("mock");
    expect(services.client).toBeInstanceOf(MockTidyClient);
    expect(services.oauth).toBeInstanceOf(MockTidyOAuth);
  });

  const LIVE_ENV = {
    TIDYHQ_MODE: "live",
    NODE_ENV: "production",
    APP_ORIGIN: "https://checkin.sml-test.invalid",
    TIDYHQ_CLIENT_ID: "cid_9f2c41d7aa",
    TIDYHQ_CLIENT_SECRET: "cs_live_2b7e90aa11",
    TIDYHQ_ADMIN_TOKEN: "at_live_77c0ffee12",
    SESSION_SECRET: "k3Jv9Qe2mXz0Lw8RtYb5Nc1Hd7Fa4GuS6pIoVxZ",
  };

  it("creates the HTTP client and live OAuth together in live mode", () => {
    const services = createTidyServices("live", LIVE_ENV);
    expect(services.mode).toBe("live");
    expect(services.client).toBeInstanceOf(HttpTidyClient);
    expect(services.oauth).toBeInstanceOf(HttpTidyOAuth);
  });

  it("refuses to build live services from an incomplete configuration", () => {
    expect(() =>
      createTidyServices("live", { ...LIVE_ENV, TIDYHQ_CLIENT_SECRET: "" }),
    ).toThrow(/TIDYHQ_CLIENT_SECRET/);
  });
});

describe("getTidyClient", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete (globalThis as { __tidy?: unknown }).__tidy;
  });

  it("returns the same instance on every call", () => {
    vi.stubEnv("TIDYHQ_MODE", "mock");
    expect(getTidyClient()).toBe(getTidyClient());
  });
});

describe("getTidyOAuth", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete (globalThis as { __tidy?: unknown }).__tidy;
  });

  it("returns the same instance on every call, so issued codes survive", () => {
    vi.stubEnv("TIDYHQ_MODE", "mock");
    expect(getTidyOAuth()).toBe(getTidyOAuth());
  });

  it("refuses to start in production when TIDYHQ_MODE is unset", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TIDYHQ_MODE", "");
    expect(() => getTidyOAuth()).toThrow(/TIDYHQ_MODE must be set/);
  });
});
