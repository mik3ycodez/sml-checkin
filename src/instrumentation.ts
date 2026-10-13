/**
 * Runs once when the server starts. Checks TIDYHQ_MODE up front, so a
 * production server without it fails at startup instead of on the first
 * sign-in. Imported only on Node.js: this file is also built for the Edge
 * runtime, which lacks node:crypto.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getTidyMode } = await import("@/lib/tidyhq");
    getTidyMode();
  }
}
