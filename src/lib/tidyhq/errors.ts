/**
 * Error from a TidyHQ call, carrying the HTTP status so callers can treat the
 * mock and live clients the same way (401 bad token, 404 not found, 422 invalid).
 * Messages end up in server logs, so they must never include tokens.
 */
export class TidyError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "TidyError";
  }
}

/**
 * Whether `error` is a TidyError (with `status`, if given). Use this, not
 * `instanceof`: Next.js bundles routes and pages separately, and the cached
 * client may throw another bundle's copy of the class.
 */
export function isTidyError(
  error: unknown,
  status?: number,
): error is TidyError {
  if (!(error instanceof Error) || error.name !== "TidyError") return false;
  const actual = (error as { status?: unknown }).status;
  if (typeof actual !== "number") return false;
  return status === undefined || actual === status;
}
