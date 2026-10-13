/**
 * Error from a TidyHQ call, carrying the HTTP status so callers can treat the
 * mock and live clients the same way (401 bad token, 404 not found, 422 invalid).
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
