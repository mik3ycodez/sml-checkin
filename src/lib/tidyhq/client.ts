import type {
  Contact,
  ContactPatch,
  Event,
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

  /** `GET /v2/contacts/{id}` */
  getContact(contactId: string): Promise<Contact>;

  /** `PATCH /v2/contacts/{id}` */
  updateContact(contactId: string, patch: ContactPatch): Promise<Contact>;

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

  /** `GET /v1/groups/{groupID}/contacts` */
  listGroupContacts(groupId: string): Promise<Contact[]>;

  /** `PUT /v1/groups/{groupID}/contacts/{contactID}`. Idempotent. */
  addContactToGroup(groupId: string, contactId: string): Promise<void>;
}
