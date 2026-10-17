import type {
  Contact,
  ContactPatch,
  Event,
  EventCheckinWindow,
  Group,
  Membership,
  MembershipLevel,
  Note,
} from "./types";

export interface ListEventsOptions {
  /** Only events that end after this time. */
  after?: Date;
  /** Only events that start before this time. */
  before?: Date;
}

/**
 * Everything the app needs from TidyHQ. Each method maps to one API endpoint.
 * Methods throw `TidyError` on failure.
 *
 * `getMe` uses the member's own OAuth token; every other method runs
 * server-side with the admin token held by the implementation.
 */
export interface TidyClient {
  /** `GET /v2/contacts/me` */
  getMe(memberToken: string): Promise<Contact>;

  /**
   * `GET /v2/contacts?search_terms=`: active contacts whose name, nickname or
   * email matches. Must follow all pages. Raw search: callers go through
   * `searchMembers` (`contacts.ts`), which enforces the minimum query length
   * and the result cap. The mock approximates TidyHQ's matching
   * (case-insensitive, every word must match somewhere); a blank query
   * returns an empty list.
   */
  searchContacts(query: string): Promise<Contact[]>;

  /** `GET /v2/contacts/{id}` */
  getContact(contactId: string): Promise<Contact>;

  /**
   * `PATCH /v2/contacts/{id}`. Returns nothing: the live client accepts any 2xx
   * (LIVE-UNKNOWN(custom-field-format), go-live checklist item 13), so a point
   * that was written is never reported as failed over the shape of the reply.
   */
  updateContact(contactId: string, patch: ContactPatch): Promise<void>;

  /** `POST /v2/contacts/{id}/notes` */
  addNote(contactId: string, text: string): Promise<Note>;

  /** `GET /v2/contacts/{id}/memberships` */
  getMemberships(contactId: string): Promise<Membership[]>;

  /** `GET /v2/membership_levels/{id}` */
  getMembershipLevel(levelId: string): Promise<MembershipLevel>;

  /** `GET /v2/events` */
  listEvents(options?: ListEventsOptions): Promise<Event[]>;

  /** `GET /v2/events/{id}` */
  getEvent(eventId: string): Promise<Event>;

  /**
   * The event's admin-set check-in window, or null if none is set. Throws 404
   * for an unknown event. Source in TidyHQ is unknown until live access (a
   * custom field or the event body, perhaps); only `getCheckinWindow` should
   * call this.
   */
  getEventCheckinWindow(eventId: string): Promise<EventCheckinWindow | null>;

  /**
   * `GET /v1/groups/{groupID}/contacts`. Must return every contact in the
   * group, following all pages: check-in uses this to tell whether a member
   * is already checked in, so a missing page would award points again.
   * Includes inactive contacts (v1 needs `show_all=true`): an inactive contact
   * can still sign in, and must show as already checked in. Identity only:
   * v1's contact list sends no custom field values or notes, so read points
   * and the like with `getContact`.
   */
  listGroupContacts(groupId: string): Promise<Contact[]>;

  /**
   * `GET /v1/contacts/{contactID}/groups`: every group the contact belongs to,
   * event or not, following all pages. Past events' attendance groups are
   * archived in TidyHQ; v1 doesn't say whether they are listed (the plan's
   * go-live checklist checks), and the app needs them to be. Throws 404 for
   * an unknown contact.
   */
  listContactGroups(contactId: string): Promise<Group[]>;

  /** `PUT /v1/groups/{groupID}/contacts/{contactID}`. Idempotent. */
  addContactToGroup(groupId: string, contactId: string): Promise<void>;
}
