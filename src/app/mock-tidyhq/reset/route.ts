import { NextResponse } from "next/server";
import { getTidyMode, getTidyServices } from "@/lib/tidyhq";

/**
 * `POST /mock-tidyhq/reset`: puts the mock TidyHQ back to its seed and drops
 * unused sign-in codes, so each end-to-end test starts clean. Mock mode only,
 * and only when `E2E=1`, which just playwright.config.ts sets: mock is the
 * default mode, so mock alone would leave this open on a demo or staging site.
 */
export async function POST() {
  // Checked before building the services, which throw in live mode.
  if (process.env.E2E !== "1" || getTidyMode() !== "mock") {
    return new NextResponse("Not found", { status: 404 });
  }
  const tidy = getTidyServices();
  if (tidy.mode !== "mock") {
    return new NextResponse("Not found", { status: 404 });
  }
  tidy.client.reset();
  tidy.oauth.reset();
  return new NextResponse(null, { status: 204 });
}
