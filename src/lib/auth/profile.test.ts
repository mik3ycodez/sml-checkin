import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanProfile, initialsOf, profileFor, validInitials } from "./profile";

afterEach(() => vi.unstubAllEnvs());

describe("initialsOf", () => {
  it.each([
    ["Dante Ruiz", "DR"],
    ["Marcus", "M"],
    ["  mary   jane  watson ", "MW"],
    ["Unnamed member", "UM"],
    ["", ""],
    ["   ", ""],
    ["42 Pat", "P"],
  ])("%j -> %j", (name, initials) => {
    expect(initialsOf(name)).toBe(initials);
  });

  it("takes a whole code point, not half a surrogate pair", () => {
    expect(initialsOf("𐐨ab Zed")).toBe("𐐀Z");
    expect(cleanProfile({ initials: initialsOf("𐐨ab Zed") }).initials).toBe(
      "𐐀Z",
    );
  });

  it("upper-cases the same in every locale", () => {
    const spy = vi.spyOn(String.prototype, "toLocaleUpperCase");
    expect(initialsOf("ian")).toBe("I");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("works on letters beyond A-Z", () => {
    expect(initialsOf("Émile Zola")).toBe("ÉZ");
  });
});

describe("cleanProfile", () => {
  it("keeps good values", () => {
    expect(
      cleanProfile({
        name: "Dante Ruiz",
        initials: "DR",
        photo: "https://img.example.org/a.jpg",
      }),
    ).toEqual({
      name: "Dante Ruiz",
      initials: "DR",
      photo: "https://img.example.org/a.jpg",
    });
  });

  it("caps the name at 100 characters", () => {
    expect(cleanProfile({ name: "x".repeat(150) }).name).toHaveLength(100);
  });

  it("cuts the name by code point, never leaving half a surrogate pair", () => {
    const name = cleanProfile({ name: `${"x".repeat(99)}😀tail` }).name!;
    expect(Array.from(name)).toHaveLength(100);
    expect(name.endsWith("😀")).toBe(true);
    expect(name).not.toMatch(/\p{Surrogate}/u);
  });

  it.each([
    ["http", "http://img.example.org/a.jpg"],
    ["javascript", "javascript:alert(1)"],
    ["data", "data:image/png;base64,AAAA"],
    ["protocol-relative", "//img.example.org/a.jpg"],
    ["relative", "/uploads/a.jpg"],
    ["empty", ""],
    ["too long", `https://img.example.org/${"a".repeat(500)}`],
    ["not a string", 42],
    ["not a url", "https://"],
  ])("drops a photo that is %s (never truncates it)", (_label, photo) => {
    expect(cleanProfile({ photo }).photo).toBeUndefined();
  });

  it("allows the mock's own avatars under /mock/, in mock mode only", () => {
    vi.stubEnv("TIDYHQ_MODE", "mock");
    expect(cleanProfile({ photo: "/mock/marcus.svg" }).photo).toBe(
      "/mock/marcus.svg",
    );
    expect(cleanProfile({ photo: "/mock/../x.svg" }).photo).toBeUndefined();
  });

  it("drops /mock/ photos in live mode and when the mode is unset", () => {
    for (const mode of ["live", ""]) {
      vi.stubEnv("TIDYHQ_MODE", mode);
      expect(cleanProfile({ photo: "/mock/marcus.svg" }).photo).toBeUndefined();
      expect(
        profileFor({
          display_name: "A B",
          first_name: "",
          last_name: "",
          profile_image: "/mock/marcus.svg",
        }).photo,
      ).toBeUndefined();
    }
  });

  it.each(["", "ABCD", "D1", "D R", 7])("drops initials %j", (initials) => {
    expect(cleanProfile({ initials }).initials).toBeUndefined();
  });

  it("returns no keys for junk input", () => {
    expect(cleanProfile(null)).toEqual({});
    expect(cleanProfile("x")).toEqual({});
    expect(cleanProfile({ name: 5 })).toEqual({});
  });
});

describe("validInitials", () => {
  it("returns 1 to 3 letters and nothing else", () => {
    expect(validInitials("DR")).toBe("DR");
    for (const v of ["", "ABCD", "D1", "D R", 7, null, undefined]) {
      expect(validInitials(v)).toBeUndefined();
    }
  });
});

describe("profileFor", () => {
  it("leaves name and initials out for a contact with no usable name", () => {
    expect(profileFor({})).toEqual({});
    expect(
      profileFor({
        display_name: "",
        first_name: "",
        last_name: "",
        initials: "XY",
        profile_image: "https://img.example.org/d.jpg",
      }),
    ).toEqual({ photo: "https://img.example.org/d.jpg" });
  });

  it("uses contactName and TidyHQ's initials when they are 1-3 letters", () => {
    expect(
      profileFor({
        display_name: "Dante Ruiz",
        first_name: "",
        last_name: "",
        initials: "DJR",
        profile_image: "https://img.example.org/d.jpg",
      }),
    ).toEqual({
      name: "Dante Ruiz",
      initials: "DJR",
      photo: "https://img.example.org/d.jpg",
    });
  });

  it("computes initials from the name when TidyHQ's are missing or odd", () => {
    for (const initials of [undefined, "", "ABCD", "1"]) {
      expect(
        profileFor({
          display_name: "Dante Ruiz",
          first_name: "",
          last_name: "",
          initials,
        }).initials,
      ).toBe("DR");
    }
  });

  it("has no photo when TidyHQ sends none", () => {
    expect(
      profileFor({ display_name: "A B", first_name: "", last_name: "" }).photo,
    ).toBeUndefined();
  });
});
