import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { isDemoMode } from "@/lib/demoMode";
import { DemoBanner } from "./DemoBanner";
import "./globals.css";

export const metadata: Metadata = {
  title: "SML Check-in",
  description: "Event check-in and points for Seattle Men in Leather",
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
