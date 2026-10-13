import { describe, expect, it } from "vitest";
import { MockTidyOAuth } from "./mock/MockTidyOAuth";
import { createTidyOAuth } from "./oauth";

describe("createTidyOAuth", () => {
  it("creates a MockTidyOAuth in mock mode", () => {
    expect(createTidyOAuth("mock")).toBeInstanceOf(MockTidyOAuth);
  });

  it("throws in live mode until the live OAuth exists", () => {
    expect(() => createTidyOAuth("live")).toThrow(/not implemented/);
  });
});
