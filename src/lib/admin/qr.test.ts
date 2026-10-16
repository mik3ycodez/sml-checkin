import QRCode from "qrcode";
import { afterEach, describe, expect, it, vi } from "vitest";
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

describe("qrSvg caching", () => {
  afterEach(() => vi.restoreAllMocks());

  it("draws a URL's code once, however often the page reloads", async () => {
    const draw = vi.spyOn(QRCode, "toString");
    const url = "https://cache.example/checkin/ev_cached";
    const first = await qrSvg(url);
    const again = await qrSvg(url);
    expect(again).toBe(first);
    expect(draw).toHaveBeenCalledTimes(1);
  });

  it("draws a different URL separately", async () => {
    const draw = vi.spyOn(QRCode, "toString");
    await qrSvg("https://cache.example/checkin/ev_one");
    await qrSvg("https://cache.example/checkin/ev_two");
    expect(draw).toHaveBeenCalledTimes(2);
  });

  it("doesn't grow without limit", async () => {
    const draw = vi.spyOn(QRCode, "toString");
    for (let i = 0; i < 300; i++) await qrSvg(`https://cache.example/c/${i}`);
    const before = draw.mock.calls.length;
    await qrSvg("https://cache.example/c/0"); // long since evicted
    expect(draw.mock.calls.length).toBe(before + 1);
  });
});
