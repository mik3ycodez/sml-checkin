import { tidyhqDomainPrefix } from "./site";

// The live settings check. Every message names a setting and what is wrong
// with it, and never prints a value: these are secrets, and a log is not where
// they belong. Kept apart from `startupConfig.ts` so `createTidyServices` can
// use it without a circular import.

export type Env = Record<string, string | undefined>;

/** Everything the live services are built from. */
export interface LiveConfig {
  clientId: string;
  clientSecret: string;
  adminToken: string;
  domainPrefix: string;
}

/**
 * What `.env.example` ships as values. A copied file that was never filled in
 * must not start in live mode. A test checks every required setting's example
 * value is refused, so a new placeholder can't slip past.
 */
const PLACEHOLDER = /^(your-|replace-with)|checkin\.example\.org/i;

const MIN_SESSION_SECRET_LENGTH = 32;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

function required(env: Env, name: string, problems: string[]): string | null {
  const value = env[name];
  if (value === undefined) {
    problems.push(`${name} is missing`);
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    problems.push(`${name} is blank`);
    return null;
  }
  if (PLACEHOLDER.test(trimmed)) {
    problems.push(`${name} is still the .env.example placeholder`);
    return null;
  }
  return trimmed;
}

/** `APP_ORIGIN` must be a bare https origin; http only for this machine. */
function checkOrigin(value: string, problems: string[]): void {
  const url = URL.canParse(value) ? new URL(value) : null;
  const bare =
    url !== null &&
    (url.protocol === "https:" || url.protocol === "http:") &&
    url.pathname === "/" &&
    !url.search &&
    !url.hash &&
    url.origin === value.replace(/\/$/, "");
  if (!bare) {
    problems.push("APP_ORIGIN must be a bare origin (scheme and host only)");
  } else if (url.protocol === "http:" && !LOCAL_HOSTS.has(url.hostname)) {
    problems.push("APP_ORIGIN must use https (http is only for localhost)");
  }
}

/**
 * The live settings, checked. Throws one error naming every setting that is
 * missing, blank, a placeholder or malformed. The group ids
 * (`ADMIN_GROUP_ID`, `HELPER_GROUP_ID`, `COLORS_GROUP_ID`) are optional on
 * purpose and never checked here: unset, the feature they guard refuses or
 * skips itself, and member check-in carries on.
 */
export function liveConfig(env: Env): LiveConfig {
  const problems: string[] = [];
  const origin = required(env, "APP_ORIGIN", problems);
  if (origin) checkOrigin(origin, problems);
  const clientId = required(env, "TIDYHQ_CLIENT_ID", problems);
  const clientSecret = required(env, "TIDYHQ_CLIENT_SECRET", problems);
  const adminToken = required(env, "TIDYHQ_ADMIN_TOKEN", problems);
  const sessionSecret = required(env, "SESSION_SECRET", problems);
  if (sessionSecret && sessionSecret.length < MIN_SESSION_SECRET_LENGTH) {
    problems.push(
      `SESSION_SECRET must be at least ${MIN_SESSION_SECRET_LENGTH} characters`,
    );
  }

  let domainPrefix = "";
  try {
    // Throws for a prefix that isn't a plain subdomain; its default is "sml".
    domainPrefix = tidyhqDomainPrefix(env.TIDYHQ_DOMAIN_PREFIX);
  } catch {
    problems.push("TIDYHQ_DOMAIN_PREFIX must be a plain TidyHQ subdomain");
  }

  if (problems.length > 0 || !clientId || !clientSecret || !adminToken) {
    throw new Error(
      `TIDYHQ_MODE=live cannot start. Fix these settings (values are not shown): ${problems.join("; ")}.`,
    );
  }
  return { clientId, clientSecret, adminToken, domainPrefix };
}
