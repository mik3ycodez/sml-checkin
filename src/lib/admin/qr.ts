import QRCode from "qrcode";

/**
 * A QR code as SVG markup, drawn on the server so it shows without
 * JavaScript and stays sharp at any print size. Black on white with the
 * standard four-module quiet zone, whatever the page's theme, since scanners
 * need dark on light. No fixed width or height: it scales to its container.
 * Error correction "M" survives a smudge or a bad printer without making the
 * code denser than a phone camera reads at arm's length.
 */
export function qrSvg(text: string): Promise<string> {
  const cached = cache.get(text);
  if (cached) return cached;
  const drawn = QRCode.toString(text, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 4,
    color: { dark: "#000000", light: "#ffffff" },
  });
  cache.set(text, drawn);
  // A failed drawing isn't kept, and the oldest entries make room.
  drawn.catch(() => cache.delete(text));
  if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value!);
  return drawn;
}

// The event page redraws every 30 seconds while check-in is open, and a URL's
// code never changes, so drawing is remembered per URL. Bounded, so a long-lived
// server can't collect codes forever.
const MAX_CACHED = 200;
const cache = new Map<string, Promise<string>>();
