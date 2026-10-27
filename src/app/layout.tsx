import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { isDemoMode } from "@/lib/demoMode";
import { DemoBanner } from "./DemoBanner";
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
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Read per request, not baked in at build time: a page prerendered by
  // `next build` would otherwise keep (or lack) the banner whatever the
  // server is later started with.
  await connection();
  return (
    <html lang="en">
      <body className="bg-background text-foreground antialiased">
        {isDemoMode() && <DemoBanner />}
        <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 py-6 sm:px-6">
          {children}
        </main>
      </body>
    </html>
  );
}
