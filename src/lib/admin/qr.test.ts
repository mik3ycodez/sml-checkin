import { describe, expect, it } from "vitest";
import { qrSvg } from "./qr";

describe("qrSvg", () => {
  const svg = qrSvg("https://checkin.example.org/checkin/ev_tonight");

  it("is an SVG that scales to its container", async () => {
    const markup = await svg;
    expect(markup).toMatch(/^<svg /);
    expect(markup).toContain("viewBox=");
    expect(markup).not.toMatch(/<svg[^>]* (width|height)=/);
  });

  it("is black on white with a quiet zone, whatever the page's theme", async () => {
    const markup = await svg;
    expect(markup).toMatch(/#000000/);
    expect(markup).toMatch(/#ffffff/);
  });

  it("is deterministic for a URL, and differs between URLs", async () => {
    expect(await qrSvg("https://a.example/x")).toBe(
      await qrSvg("https://a.example/x"),
    );
    expect(await qrSvg("https://a.example/x")).not.toBe(
      await qrSvg("https://a.example/y"),
    );
  });
});
