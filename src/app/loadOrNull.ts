import { isTidyError } from "@/lib/tidyhq/errors";

/**
 * Runs a TidyHQ read for one section of a page. If TidyHQ itself fails
 * (`TidyError`), logs it and returns null, so the page can say that section
 * couldn't load and still render the rest. Anything else is a bug in our own
 * code and is rethrown to the page's error screen, not blamed on TidyHQ.
 * The log has the TidyHQ status and message, which never carry tokens, and
 * never the error object itself.
 */
export async function loadOrNull<T>(
  label: string,
  read: () => Promise<T>,
): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    if (!isTidyError(error)) throw error;
    console.error(`${label}:`, `TidyError ${error.status}: ${error.message}`);
    return null;
  }
}
