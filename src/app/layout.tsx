import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { isDemoMode } from "@/lib/demoMode";
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The browser bar matches --surface, the header, in each scheme.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#171717" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Read per request, not baked in at build time: a page prerendered by
  // `next build` would otherwise keep (or lack) the banner whatever the
  // server is later started with.
  await connection();
  const { profile, returnTo } = await loadHeaderProfile();
  return (
    <html lang="en">
      <body className="bg-background text-foreground flex min-h-dvh flex-col antialiased">
        {isDemoMode() && <DemoBanner />}
        <SiteHeader profile={profile} returnTo={returnTo} />
        {/* flex-1: the banner and header sit above, and main takes the rest of
            the screen, so pages that center their content center below them. */}
        <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 py-6 sm:px-6">
          {children}
        </main>
      </body>
    </html>
  );
}
