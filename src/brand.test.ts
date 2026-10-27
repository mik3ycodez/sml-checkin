import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The brand files are SML's official logos, plus icons made from them without
// redrawing. They must never change: no edit, resize, recompress or
// re-export, and no file added or removed. See the invariant in CLAUDE.md.
// If this fails on purpose (the Board supplied new files), update the hashes
// here in the same PR and say so in its description.

const DIR = join(__dirname, "..", "public", "brand");

const SHA256: Record<string, string> = {
  "sml-logo-black.png":
    "4a5cc60e1083d22309357e0f4a215bd41e2937e00dbea1401e0ce20bb0c67f2a",
  "sml-logo-white.png":
    "765a782c15ec92627eda0b29414ea61bb04162784478afb276c222d2562f10af",
  "sml-logo-black-square.png":
    "9b47521f3a9fed686f9b3625ce9fa2b6de498fcc3b2c75f91725e1edaed35e2d",
  "sml-logo-white-square.png":
    "eea8d55706531e80ccc1604e154adfd9df713e20830c7dac3b22e610fb3b0b46",
  "sml-logo-black-print.png":
    "fd7c0fdcc481cccd4d3b2db53df4ba7ab1c0b25fbfeeabeb2ed3f9a8ca4a0a89",
  "sml-logo-white-print.png":
    "f33bbdf0701c903f8982afc942d1b45703eda6e2e84cbdc442ad71ce1438bae4",
  "sml-icon-512.png":
    "9578fcd828100e61e63f2f6a9aff1be5acf3a2a6153650be43f00de5ae455fcf",
  "sml-icon-192.png":
    "27f991b0add9c9b3d6cd6e5cf8fb5fee3198c3cf3e44259f9a18e1c1542b52b2",
  "sml-icon-maskable-512.png":
    "da162819467b03bbda936364e87786f6dd66e63b134a85ce84dc15289fa4f42a",
  "apple-touch-icon.png":
    "cf184eb63811e7e7e4e30bbbae1a3ae6be8244280551e2debac99c03610463f8",
};

const RULE = "See the brand-files invariant in CLAUDE.md.";

describe("public/brand", () => {
  it("holds exactly the ten locked files", () => {
    expect(readdirSync(DIR).sort(), RULE).toEqual(Object.keys(SHA256).sort());
  });

  it.each(Object.entries(SHA256))(
    "%s is byte-for-byte unchanged",
    (name, hash) => {
      const actual = createHash("sha256")
        .update(readFileSync(join(DIR, name)))
        .digest("hex");
      expect(actual, `${name} changed. ${RULE}`).toBe(hash);
    },
  );
});
