/**
 * Runs once when the server starts. Checks the configuration up front, so a
 * bad deploy fails at startup instead of on the first sign-in: production
 * needs TIDYHQ_MODE and APP_ORIGIN, live mode needs every credential filled
 * in (no blanks or .env.example placeholders), mock mode in production needs
 * DEMO_MODE=on and a real SESSION_SECRET (live mode checks it with the other
 * credentials, once), and TIDYHQ_DOMAIN_PREFIX (used for the renew link) must be a
 * plain subdomain. Messages name settings, never print values.
 * Imported only on Node.js: this file is also built for the Edge runtime,
 * which lacks node:crypto.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { checkStartupConfig } = await import("@/lib/startupConfig");
    const { configuredAppOrigin } = await import("@/lib/auth/requestOrigin");
    const { getTidyServices } = await import("@/lib/tidyhq");
    const { tidyhqSiteUrl } = await import("@/lib/tidyhq/site");
    checkStartupConfig();
    configuredAppOrigin();
    getTidyServices();
    tidyhqSiteUrl();
  }
}
