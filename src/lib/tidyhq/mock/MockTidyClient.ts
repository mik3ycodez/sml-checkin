import type { ListEventsOptions, TidyClient } from "../client";
import { TidyError } from "../errors";
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
import { createSeed, MOCK_ADMIN_CONTACT_ID, type MockSeed } from "./seed";

const TOKEN_PREFIX = "mock-token-";

/** Token the fake sign-in page hands out for a seed member. */
export function issueMockToken(contactId: string): string {
  return `${TOKEN_PREFIX}${contactId}`;
}

/**
 * In-memory TidyHQ. Returns copies of its state so callers can't mutate it,
 * and throws `TidyError` where the real API would return an error status.
 */
export class MockTidyClient implements TidyClient {
  private readonly initial: MockSeed;
  private state: MockSeed;
  private noteCounter = 0;

  constructor(
    seed: MockSeed = createSeed(),
    private readonly now: () => Date = () => new Date(),
  ) {
    this.initial = structuredClone(seed);
    this.state = structuredClone(seed);
  }

  /**
   * Puts everything back to the seed it was built with. Mock only (not part
   * of TidyClient): for the end-to-end tests' reset route.
   */
  reset(): void {
    this.state = structuredClone(this.initial);
    this.noteCounter = 0;
  }

  async getMe(memberToken: string): Promise<Contact> {
    const contactId = memberToken.startsWith(TOKEN_PREFIX)
      ? memberToken.slice(TOKEN_PREFIX.length)
      : "";
    const contact = this.state.contacts.find((c) => c.id === contactId);
    if (!contact) throw new TidyError(401, "Invalid or expired token");
    return structuredClone(contact);
  }

  /** Every contact. Mock only (not part of TidyClient): for the fake sign-in page. */
  async listContacts(): Promise<Contact[]> {
    return structuredClone(this.state.contacts);
  }

  async searchContacts(query: string): Promise<Contact[]> {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];
    const matches = this.state.contacts.filter((c) => {
      if (c.status !== "active") return false;
      const text = [
        c.display_name,
        c.first_name,
        c.last_name,
        c.nick_name,
        c.email_address,
      ]
        .join(" ")
        .toLowerCase();
      return words.every((w) => text.includes(w));
    });
    return structuredClone(matches);
  }

  async getContact(contactId: string): Promise<Contact> {
    return structuredClone(this.findContact(contactId));
  }

  async updateContact(
    contactId: string,
    patch: ContactPatch,
  ): Promise<Contact> {
    const contact = this.findContact(contactId);
    for (const [fieldId, value] of Object.entries(patch.custom_fields ?? {})) {
      const field = contact.custom_fields[fieldId];
      if (!field) {
        throw new TidyError(422, `Unknown custom field ${fieldId}`);
      }
      field.value = value;
    }
    contact.updated_at = this.now().toISOString();
    return structuredClone(contact);
  }

  async addNote(contactId: string, text: string): Promise<Note> {
    const contact = this.findContact(contactId);
    if (!text.trim()) throw new TidyError(422, "Note text is required");
    const timestamp = this.now().toISOString();
    const note: Note = {
      id: `note_${++this.noteCounter}`,
      author_id: MOCK_ADMIN_CONTACT_ID,
      text,
      created_at: timestamp,
      updated_at: timestamp,
    };
    contact.notes.push(note);
    return structuredClone(note);
  }

  async getMemberships(contactId: string): Promise<Membership[]> {
    this.findContact(contactId);
    return structuredClone(
      this.state.memberships.filter((m) => m.contact_id === contactId),
    );
  }

  async getMembershipLevel(levelId: string): Promise<MembershipLevel> {
    const level = this.state.membershipLevels.find((l) => l.id === levelId);
    if (!level)
      throw new TidyError(404, `Membership level ${levelId} not found`);
    return structuredClone(level);
  }

  async listEvents(options: ListEventsOptions = {}): Promise<Event[]> {
    const { after, before } = options;
    const events = this.state.events
      .filter(
        (e) => !after || (e.end_at !== null && new Date(e.end_at) > after),
      )
      .filter(
        (e) =>
          !before || (e.start_at !== null && new Date(e.start_at) < before),
      )
      .sort((a, b) => (a.start_at ?? "").localeCompare(b.start_at ?? ""));
    return structuredClone(events);
  }

  async getEvent(eventId: string): Promise<Event> {
    return structuredClone(this.findEvent(eventId));
  }

  async getEventCheckinWindow(
    eventId: string,
  ): Promise<EventCheckinWindow | null> {
    this.findEvent(eventId);
    return structuredClone(this.state.checkinWindows[eventId] ?? null);
  }

  async listGroupContacts(groupId: string): Promise<Contact[]> {
    const memberIds = this.findGroupMembers(groupId);
    return structuredClone(
      this.state.contacts.filter((c) => memberIds.includes(c.id)),
    );
  }

  async listContactGroups(contactId: string): Promise<Group[]> {
    this.findContact(contactId);
    const groups = this.state.groups.filter((g) =>
      this.state.groupMembers[g.id]?.includes(contactId),
    );
    return structuredClone(groups);
  }

  async addContactToGroup(groupId: string, contactId: string): Promise<void> {
    const memberIds = this.findGroupMembers(groupId);
    this.findContact(contactId);
    if (memberIds.includes(contactId)) return;
    memberIds.push(contactId);
    const group = this.state.groups.find((g) => g.id === groupId)!;
    group.size = memberIds.length;
    group.updated_at = this.now().toISOString();
  }

  private findContact(contactId: string): Contact {
    const contact = this.state.contacts.find((c) => c.id === contactId);
    if (!contact) throw new TidyError(404, `Contact ${contactId} not found`);
    return contact;
  }

  private findEvent(eventId: string): Event {
    const event = this.state.events.find((e) => e.id === eventId);
    if (!event) throw new TidyError(404, `Event ${eventId} not found`);
    return event;
  }

  private findGroupMembers(groupId: string): string[] {
    const memberIds = this.state.groupMembers[groupId];
    if (!memberIds) throw new TidyError(404, `Group ${groupId} not found`);
    return memberIds;
  }
}
