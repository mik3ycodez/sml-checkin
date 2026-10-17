/** SML's TidyHQ prefix, used when `TIDYHQ_DOMAIN_PREFIX` isn't set. */
const DEFAULT_DOMAIN_PREFIX = "sml";

/**
 * SML's own TidyHQ site, where members renew and manage their membership.
 * Built from `TIDYHQ_DOMAIN_PREFIX` (default `sml`). The prefix must be a
 * plain subdomain label, so a bad setting can't point members somewhere else.
 */
export function tidyhqSiteUrl(
  prefix: string | undefined = process.env.TIDYHQ_DOMAIN_PREFIX,
): string {
  return `https://${tidyhqDomainPrefix(prefix)}.tidyhq.com`;
}

/**
 * The checked `TIDYHQ_DOMAIN_PREFIX` (default `sml`), lowercased. Also what
 * sign-in sends as `domain_prefix`.
 */
export function tidyhqDomainPrefix(
  prefix: string | undefined = process.env.TIDYHQ_DOMAIN_PREFIX,
): string {
  const label = prefix?.trim().toLowerCase() || DEFAULT_DOMAIN_PREFIX;
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)) {
    throw new Error(
      `TIDYHQ_DOMAIN_PREFIX must be a TidyHQ subdomain such as "sml", got "${prefix}"`,
    );
  }
  return label;
}
