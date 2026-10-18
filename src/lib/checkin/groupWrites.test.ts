import { describe, expect, it, vi } from "vitest";
import { POINTS_FIELD_ID } from "../tidyhq/customFields";
import { MockTidyClient } from "../tidyhq/mock/MockTidyClient";
import { createSeed } from "../tidyhq/mock/seed";
import { checkIn, type CheckInInput } from "./checkIn";

// The app writes no reward group and no reward field. The Board's TidyHQ smart
// group tracks who reached a reward level, so a check-in writes exactly: the
// event's attendance group, the points field, and (staff only) a note. These
// tests record every write the client receives and fail on any extra one,
// whatever code path or helper makes it.

const NOW = new Date("2026-10-12T18:00:00Z");
const BASE = { eventId: "ev_tonight", contactId: "c_dante", now: NOW };

describe("a check-in's writes", () => {
  it.each([
    ["self", { ...BASE } as CheckInInput, []],
    [
      "staff",
      {
        ...BASE,
        method: "staff",
        staff: { contactId: "c_pat", name: "Pat Rivera", role: "volunteer" },
      } as CheckInInput,
      ["note:c_dante"],
    ],
  ])(
    "%s: write only the event group, the points field and (staff) the note, even for a member who reaches 18",
    async (_label, input, tail) => {
      const seed = createSeed(NOW);
      seed.contacts.find((c) => c.id === "c_dante")!.custom_fields[
        POINTS_FIELD_ID
      ] = { id: POINTS_FIELD_ID, title: "Points", type: "string", value: "17" };
      const client = new MockTidyClient(seed, () => NOW);
      const writes: string[] = [];
      const add = client.addContactToGroup.bind(client);
      const update = client.updateContact.bind(client);
      const note = client.addNote.bind(client);
      vi.spyOn(client, "addContactToGroup").mockImplementation(async (g, c) => {
        writes.push(`group:${g}:${c}`);
        return add(g, c);
      });
      vi.spyOn(client, "updateContact").mockImplementation(async (c, p) => {
        writes.push(
          `fields:${c}:${Object.keys(p.custom_fields ?? {}).join(",")}`,
        );
        return update(c, p);
      });
      vi.spyOn(client, "addNote").mockImplementation(async (c, t) => {
        writes.push(`note:${c}`);
        return note(c, t);
      });

      const result = await checkIn(client, input);

      expect(result).toMatchObject({ status: "checked_in", total: 18 });
      expect(writes).toEqual([
        "group:grp_social_night:c_dante",
        `fields:c_dante:${POINTS_FIELD_ID}`,
        ...tail,
      ]);
    },
  );
});
