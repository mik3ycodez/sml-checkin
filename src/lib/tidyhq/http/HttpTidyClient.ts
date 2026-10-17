import { sortEventsByStart } from "../eventOrder";
import type { ListEventsOptions, TidyClient } from "../client";
import type {
  Contact,
  ContactPatch,
  Event,
  EventCheckinWindow,
  Group,
  Membership,
  MembershipLevel,
  Note,
} from "../types";
import { POINTS_FIELD_ID } from "../customFields";
import { tidyRequest, tidyRequestAll, type TidyVersion } from "./request";
import {
  parseContact,
  parseEvent,
  parseGroup,
  parseMembership,
  parseMembershipLevel,
  parseNote,
} from "./shapes";

export interface HttpTidyClientOptions {
  /** `TIDYHQ_ADMIN_TOKEN`: used for every call except `getMe`. */
  adminToken: string;
  /** Tests inject a fake; otherwise the global `fetch`. */
  fetch?: typeof fetch;
  /** Pause before a read's one retry; tests skip it. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * The value a points field gets when a v2 contact came back without the key.
 * `readPoints` reads any non-string value as unreadable, and this is no
 * string, so check-in refuses (`points_unreadable`) and never writes over a
 * balance the token may simply not be able to see.
 *
 * LIVE-UNKNOWN(missing-points-field): whether TidyHQ omits the key for a
 * member with no answer, or sends it blank. Until go-live checklist item 2
 * says, a missing key is unreadable (a blank value still counts as 0). If it
 * turns out TidyHQ omits unanswered fields, delete this and `markMissingPoints`.
 */
const MISSING_POINTS = { missing: true };

/** v2 contact parsing, plus the live-only rule for a missing points field. */
function parseV2Contact(raw: unknown): Contact {
  const contact = parseContact(raw, "v2");
  if (!(POINTS_FIELD_ID in contact.custom_fields)) {
    contact.custom_fields[POINTS_FIELD_ID] = {
      id: POINTS_FIELD_ID,
      title: "",
      type: "string",
      value: MISSING_POINTS,
    };
  }
  return contact;
}

/**
 * The real TidyHQ, over `tidyRequest` (auth, timeouts, retries, paging, safe
 * logging, error mapping). Each method here only names a path and a shape.
 *
 * Writes go through the same layer and are never retried: a write that timed
 * out may have happened anyway, and check-in's rule (a failure between the
 * group add and the points write may miss a point, never double-award)
 * depends on that.
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
    return parseV2Contact(raw);
  }

  async searchContacts(query: string): Promise<Contact[]> {
    // A blank search_terms may well mean "everyone": send nothing instead.
    const terms = query.trim();
    if (terms === "") return [];
    const raw = await this.list("v2", "/contacts", { search_terms: terms });
    return raw.map(parseV2Contact);
  }

  async listAllContacts(): Promise<Contact[]> {
    const raw = await this.list("v2", "/contacts");
    return raw.map(parseV2Contact);
  }

  async getContact(contactId: string): Promise<Contact> {
    return parseV2Contact(await this.record("v2", `/contacts/${contactId}`));
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
    return sortEventsByStart(raw.map(parseEvent));
  }

  async getEvent(eventId: string): Promise<Event> {
    return parseEvent(await this.record("v2", `/events/${eventId}`));
  }

  async listGroupContacts(groupId: string): Promise<Contact[]> {
    // v1 leaves out inactive contacts unless asked. We ask: check-in tells
    // "already checked in" from this list, and an inactive contact can still
    // sign in and tap again.
    const raw = await this.list("v1", `/groups/${groupId}/contacts`, {
      show_all: "true",
    });
    return raw.map((c) => parseContact(c, "v1"));
  }

  async listContactGroups(contactId: string): Promise<Group[]> {
    const raw = await this.list("v1", `/contacts/${contactId}/groups`);
    return raw.map(parseGroup);
  }

  async updateContact(
    contactId: string,
    patch: ContactPatch,
  ): Promise<Contact> {
    return parseV2Contact(
      await tidyRequest({
        ...this.common("v2", `/contacts/${contactId}`),
        method: "PATCH",
        body: patch,
        expect: "record",
      }),
    );
  }

  async addNote(contactId: string, text: string): Promise<Note> {
    return parseNote(
      await tidyRequest({
        ...this.common("v2", `/contacts/${contactId}/notes`),
        method: "POST",
        body: { text },
        expect: "record",
      }),
    );
  }

  async addContactToGroup(groupId: string, contactId: string): Promise<void> {
    // LIVE-UNKNOWN(group-put-response): v1's spec says this answers 204, but
    // what TidyHQ sends for a new member and for one already in the group
    // isn't confirmed (go-live checklist item 16), so any 2xx counts. Once it
    // is, tighten `expect`: the spec's answer is no body, and a wrongly strict
    // check would report an add that happened as a failure.
    await tidyRequest({
      ...this.common("v1", `/groups/${groupId}/contacts/${contactId}`),
      method: "PUT",
      expect: "none",
    });
  }

  async getEventCheckinWindow(
    eventId: string,
  ): Promise<EventCheckinWindow | null> {
    void eventId;
    // LIVE-UNKNOWN(checkin-window): neither TidyHQ spec has a check-in open or
    // close time on an event, and we know of no other place the Board could set
    // one. So live mode has no admin-set window and check-in uses the event's
    // own start and end (the fallback). Makes no request, and so doesn't 404
    // an unknown event: callers read the event too and get theirs from that.
    // Go-live checklist item 4: if TidyHQ does carry one, read it here.
    return null;
  }
}
