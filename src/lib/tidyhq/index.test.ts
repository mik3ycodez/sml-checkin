import { afterEach, describe, expect, it, vi } from "vitest";
import { createTidyClient, getTidyClient, parseTidyMode } from ".";
import { MockTidyClient } from "./mock/MockTidyClient";

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
    delete (globalThis as { __tidyClient?: unknown }).__tidyClient;
  });

  it("returns the same instance on every call", () => {
    vi.stubEnv("TIDYHQ_MODE", "mock");
    expect(getTidyClient()).toBe(getTidyClient());
  });
});
