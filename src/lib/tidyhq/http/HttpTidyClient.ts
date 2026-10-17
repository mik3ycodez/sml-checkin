import type { ListEventsOptions, TidyClient } from "../client";
import type {
  Contact,
  Event,
  EventCheckinWindow,
  Group,
  Membership,
  MembershipLevel,
  Note,
} from "../types";
import { tidyRequest, tidyRequestAll, type TidyVersion } from "./request";
import {
  parseContact,
  parseEvent,
  parseGroup,
  parseMembership,
  parseMembershipLevel,
} from "./shapes";

export interface HttpTidyClientOptions {
  /** `TIDYHQ_ADMIN_TOKEN`: used for every call except `getMe`. */
  adminToken: string;
  /** Tests inject a fake; otherwise the global `fetch`. */
  fetch?: typeof fetch;
  /** Pause before a read's one retry; tests skip it. */
  sleep?: (ms: number) => Promise<void>;
}

/** A write method that milestone 5, PR 4 builds. Never a silent no-op. */
function notBuiltYet(method: string): never {
  throw new Error(
    `HttpTidyClient.${method} is not implemented yet (milestone 5, PR 4)`,
  );
}

/**
 * The real TidyHQ, over `tidyRequest` (auth, timeouts, retries, paging, safe
 * logging, error mapping). Each method here only names a path and a shape.
 * Reads only so far.
 */
export class HttpTidyClient implements TidyClient {
  constructor(private readonly options: HttpTidyClientOptions) {}

  private common(version: TidyVersion, path: string) {
    return {
      fetch: this.options.fetch ?? ((...args) => globalThis.fetch(...args)),
      sleep: this.options.sleep,
      token: this.options.adminToken,
      tokenKind: "admin" as const,
      version,
      path,
    };
  }

  private record(version: TidyVersion, path: string): Promise<unknown> {
    return tidyRequest({
      ...this.common(version, path),
      method: "GET",
      expect: "record",
    });
  }

  private list(
    version: TidyVersion,
    path: string,
    query?: Record<string, string>,
  ): Promise<unknown[]> {
    return tidyRequestAll({ ...this.common(version, path), query });
  }

  async getMe(memberToken: string): Promise<Contact> {
    // The one call made with the member's own token, and only to identify them.
    const raw = await tidyRequest({
      ...this.common("v2", "/contacts/me"),
      token: memberToken,
      tokenKind: "member",
      method: "GET",
      expect: "record",
    });
    return parseContact(raw, "v2");
  }

  async searchContacts(query: string): Promise<Contact[]> {
    // A blank search_terms may well mean "everyone": send nothing instead.
    const terms = query.trim();
    if (terms === "") return [];
    const raw = await this.list("v2", "/contacts", { search_terms: terms });
    return raw.map((c) => parseContact(c, "v2"));
  }

  async listAllContacts(): Promise<Contact[]> {
    const raw = await this.list("v2", "/contacts");
    return raw.map((c) => parseContact(c, "v2"));
  }

  async getContact(contactId: string): Promise<Contact> {
    return parseContact(
      await this.record("v2", `/contacts/${contactId}`),
      "v2",
    );
  }

  async getMemberships(contactId: string): Promise<Membership[]> {
    const raw = await this.list("v2", `/contacts/${contactId}/memberships`);
    return raw.map(parseMembership);
  }

  async getMembershipLevel(levelId: string): Promise<MembershipLevel> {
    return parseMembershipLevel(
      await this.record("v2", `/membership_levels/${levelId}`),
    );
  }

  async listEvents(options: ListEventsOptions = {}): Promise<Event[]> {
    const query: Record<string, string> = {};
    if (options.after) query.after = options.after.toISOString();
    if (options.before) query.before = options.before.toISOString();
    const raw = await this.list("v2", "/events", query);
    // The spec promises no order, so sort here, as the mock does.
    return raw
      .map(parseEvent)
      .sort((a, b) => (a.start_at ?? "").localeCompare(b.start_at ?? ""));
  }

  async getEvent(eventId: string): Promise<Event> {
    return parseEvent(await this.record("v2", `/events/${eventId}`));
  }

  async listGroupContacts(groupId: string): Promise<Contact[]> {
    const raw = await this.list("v1", `/groups/${groupId}/contacts`);
    return raw.map((c) => parseContact(c, "v1"));
  }

  async listContactGroups(contactId: string): Promise<Group[]> {
    const raw = await this.list("v1", `/contacts/${contactId}/groups`);
    return raw.map(parseGroup);
  }

  // Writes and the check-in window land in PR 4. A method with no parameters
  // still satisfies the interface.
  async updateContact(): Promise<Contact> {
    return notBuiltYet("updateContact");
  }

  async addNote(): Promise<Note> {
    return notBuiltYet("addNote");
  }

  async addContactToGroup(): Promise<void> {
    return notBuiltYet("addContactToGroup");
  }

  async getEventCheckinWindow(): Promise<EventCheckinWindow | null> {
    return notBuiltYet("getEventCheckinWindow");
  }
}
