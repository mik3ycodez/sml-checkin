/**
 * Runs once when the server starts. Checks the configuration up front, so a
 * bad deploy fails at startup instead of on the first sign-in: production
 * needs TIDYHQ_MODE and APP_ORIGIN, the chosen mode must be implemented, and
 * TIDYHQ_DOMAIN_PREFIX (used for the renew link) must be a plain subdomain.
 * Imported only on Node.js: this file is also built for the Edge runtime,
 * which lacks node:crypto.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { configuredAppOrigin } = await import("@/lib/auth/requestOrigin");
    const { getTidyServices } = await import("@/lib/tidyhq");
    const { tidyhqSiteUrl } = await import("@/lib/tidyhq/site");
    configuredAppOrigin();
    getTidyServices();
    tidyhqSiteUrl();
  }
}
