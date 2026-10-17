import { configuredAppOrigin } from "../auth/requestOrigin";
import {
  MIN_SESSION_SECRET_LENGTH,
  sessionSecretProblem,
} from "../auth/sessionSecret";
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

/**
 * `APP_ORIGIN` must be what the app itself accepts in production
 * (`configuredAppOrigin`: a bare origin, https except for localhost), so the
 * two can't disagree. Its error text quotes the value, so it is replaced.
 */
function checkOrigin(value: string, problems: string[]): void {
  try {
    configuredAppOrigin({ APP_ORIGIN: value, NODE_ENV: "production" });
  } catch {
    problems.push(
      "APP_ORIGIN must be a bare https origin (scheme and host only; http is only for localhost)",
    );
  }
}

/**
 * What is wrong with `SESSION_SECRET` (missing, blank, a `.env.example`
 * placeholder, or shorter than the session code accepts), or null. Never
 * contains the value. Needed by every production start, live or demo.
 */
export function sessionSecretIssue(env: Env): string | null {
  const problems: string[] = [];
  required(env, "SESSION_SECRET", problems);
  if (problems.length === 0 && sessionSecretProblem(env.SESSION_SECRET)) {
    problems.push(
      `SESSION_SECRET must be at least ${MIN_SESSION_SECRET_LENGTH} characters`,
    );
  }
  return problems[0] ?? null;
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
  const sessionProblem = sessionSecretIssue(env);
  if (sessionProblem) problems.push(sessionProblem);

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
