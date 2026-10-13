import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createTidyClient,
  createTidyServices,
  getTidyClient,
  getTidyOAuth,
  parseTidyMode,
} from ".";
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
    it.each([undefined, "", "  "])("refuses to default to mock (%j)", (value) => {
      expect(() => parseTidyMode(value, "production")).toThrow(
        /TIDYHQ_MODE must be set/,
      );
    });

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

  it("throws in live mode until the live implementations exist", () => {
    expect(() => createTidyServices("live")).toThrow(/not implemented/);
  });
});

describe("createTidyClient", () => {
  it("creates a MockTidyClient in mock mode", () => {
    expect(createTidyClient("mock")).toBeInstanceOf(MockTidyClient);
  });

  it("throws in live mode until HttpTidyClient exists", () => {
    expect(() => createTidyClient("live")).toThrow(/not implemented/);
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
