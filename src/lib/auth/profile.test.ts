import { describe, expect, it } from "vitest";
import { cleanProfile, initialsOf, profileFor } from "./profile";

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

  it("allows the mock's own avatars under /mock/", () => {
    expect(cleanProfile({ photo: "/mock/marcus.svg" }).photo).toBe(
      "/mock/marcus.svg",
    );
    expect(cleanProfile({ photo: "/mock/../x.svg" }).photo).toBeUndefined();
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

describe("profileFor", () => {
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
