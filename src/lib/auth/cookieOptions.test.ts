import { describe, expect, it } from "vitest";
import { secureCookieOptions } from "./cookieOptions";

describe("secureCookieOptions", () => {
  it("is always httpOnly and lax", () => {
    expect(secureCookieOptions({})).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
    });
  });

  it("marks cookies secure when APP_ORIGIN is https", () => {
    expect(
      secureCookieOptions({ APP_ORIGIN: "https://checkin.example.org" }).secure,
    ).toBe(true);
  });

  it("doesn't when APP_ORIGIN is http (browsers like WebKit would drop them)", () => {
    expect(
      secureCookieOptions({ APP_ORIGIN: "http://localhost:3100" }).secure,
    ).toBe(false);
  });

  it("doesn't when APP_ORIGIN is unset (development guesses from the request)", () => {
    expect(secureCookieOptions({}).secure).toBe(false);
    expect(secureCookieOptions({ APP_ORIGIN: " " }).secure).toBe(false);
  });
});
