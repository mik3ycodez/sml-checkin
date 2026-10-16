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
  return QRCode.toString(text, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 4,
    color: { dark: "#000000", light: "#ffffff" },
  });
}
