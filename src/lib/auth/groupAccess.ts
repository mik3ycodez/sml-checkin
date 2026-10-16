import type { TidyClient, TidyMode } from "../tidyhq";
import { isTidyError } from "../tidyhq/errors";

// What the admin and volunteer checks share: reading a group-id setting, and
// reading a group's members so that a failure is described the same safe way
// in both. Each check decides for itself whether to log.

/** A TidyHQ group id: letters, digits, `_` and `-`, so it can't alter a URL path. */
const GROUP_ID = /^[A-Za-z0-9_-]+$/;

/**
 * A group id setting: the id, or why there isn't a usable one:
 * `not_configured` (unset or blank) or `invalid` (set, but not a group id),
 * so a log points at the real problem.
 */
export type GroupSetting =
  { id: string } | { problem: "not_configured" | "invalid" };

/**
 * Reads a group id setting: the trimmed value if it's a usable id.
 * `mockDefault` stands in only for an unset or blank value in mock mode, so
 * development needs no setup; live mode has no default.
 */
export function groupFromSetting(
  value: string | undefined,
  mockDefault: string,
  mode: TidyMode,
): GroupSetting {
  const configured = value?.trim();
  if (!configured) {
    return mode === "mock"
      ? { id: mockDefault }
      : { problem: "not_configured" };
  }
  return GROUP_ID.test(configured)
    ? { id: configured }
    : { problem: "invalid" };
}

type Contact = Awaited<ReturnType<TidyClient["listGroupContacts"]>>[number];

/** Why a group couldn't be read; safe to log (never a token or a raw message). */
export type GroupReadFailure =
  | { reason: "not_configured" | "invalid" }
  | { reason: "read_failed"; tidyStatus: number; message: string }
  | { reason: "read_failed"; errorName: string };

/**
 * A group's members, or why they couldn't be read. Never throws and never
 * logs. For a TidyHQ error the failure carries its status and message
 * (TidyErrors never carry tokens); for any other error, only its name.
 */
export async function readGroupMembers(
  client: TidyClient,
  group: GroupSetting,
): Promise<{ members: Contact[] } | { failure: GroupReadFailure }> {
  if ("problem" in group) return { failure: { reason: group.problem } };
  try {
    return { members: await client.listGroupContacts(group.id) };
  } catch (error) {
    return {
      failure: isTidyError(error)
        ? {
            reason: "read_failed",
            tidyStatus: error.status,
            message: error.message,
          }
        : {
            reason: "read_failed",
            errorName: error instanceof Error ? error.name : "unknown",
          },
    };
  }
}
