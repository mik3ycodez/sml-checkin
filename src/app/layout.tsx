import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { isDemoMode } from "@/lib/demoMode";
import { THEME_BAR_COLORS } from "@/lib/theme";
import { currentTheme } from "./currentTheme";
import { DemoBanner } from "./DemoBanner";
import { loadHeaderProfile } from "./headerProfile";
import { SiteHeader } from "./SiteHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: "SML Check-in",
  description: "Event check-in and points for Seattle Men in Leather",
  // Pointed at the locked files in public/brand, not Next's file convention
  // (src/app/icon.png), which would need a second copy of each outside the lock.
  icons: {
    icon: [
      { url: "/brand/sml-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/brand/sml-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      {
        url: "/brand/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

// Per request, because the browser bar follows the theme cookie. The bar
// matches --surface, the header, in each scheme. With the device's setting
// (system) there are two entries keyed on prefers-color-scheme; a forced theme
// gets a single entry with no media query, or the device's scheme would still
// pick the other color.
export async function generateViewport(): Promise<Viewport> {
  const theme = await currentTheme();
  return {
    width: "device-width",
    initialScale: 1,
    themeColor:
      theme === "system"
        ? [
            {
              media: "(prefers-color-scheme: light)",
              color: THEME_BAR_COLORS.light,
            },
            {
              media: "(prefers-color-scheme: dark)",
              color: THEME_BAR_COLORS.dark,
            },
          ]
        : THEME_BAR_COLORS[theme],
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Read per request, not baked in at build time: a page prerendered by
  // `next build` would otherwise keep (or lack) the banner whatever the
  // server is later started with.
  await connection();
  const { profile, returnTo, pagePath } = await loadHeaderProfile();
  const theme = await currentTheme();
  return (
    // data-theme is set on the server, so the first byte of HTML is already
    // themed: no flash, and no script. System sets none and follows the device.
    <html lang="en" data-theme={theme === "system" ? undefined : theme}>
      <body className="bg-background text-foreground flex min-h-dvh flex-col antialiased">
        {isDemoMode() && <DemoBanner />}
        <SiteHeader
          profile={profile}
          returnTo={returnTo}
          theme={theme}
          pagePath={pagePath}
        />
        {/* flex-1: the banner and header sit above, and main takes the rest of
            the screen, so pages that center their content center below them. */}
        <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 py-6 sm:px-6">
          {children}
        </main>
      </body>
    </html>
  );
}
