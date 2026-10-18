import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { POINTS_FIELD_ID } from "../tidyhq/customFields";
import { MockTidyClient } from "../tidyhq/mock/MockTidyClient";
import { createSeed } from "../tidyhq/mock/seed";
import { checkIn, type CheckInInput } from "./checkIn";

// The app writes no reward group. The Board's TidyHQ smart group tracks who
// reached a reward level, so the only group write is the event's attendance
// group, made by check-in. These tests break that if a second one appears.

const NOW = new Date("2026-10-12T18:00:00Z");
const SRC = join(__dirname, "..", "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !entry.name.includes(".test.")
      ? [path]
      : [];
  });
}

describe("addContactToGroup call sites", () => {
  it("is called from one place outside the TidyHQ clients: the event-group add in checkIn.ts", () => {
    // The client interface, mock, HTTP client, fake server and contract suite
    // (all under src/lib/tidyhq) define or exercise it; they don't use it.
    const files = sourceFiles(SRC).filter(
      (f) => !f.includes(join("src", "lib", "tidyhq") + "/"),
    );
    expect(files.length).toBeGreaterThan(20); // guards against scanning nothing
    const calls = files.flatMap((f) =>
      [...readFileSync(f, "utf8").matchAll(/addContactToGroup\(/g)].map(() =>
        f.slice(SRC.length + 1),
      ),
    );
    expect(calls).toEqual([join("lib", "checkin", "checkIn.ts")]);
  });
});

describe("a check-in's writes", () => {
  const BASE = { eventId: "ev_tonight", contactId: "c_dante", now: NOW };
  it.each([
    ["self", { ...BASE } as CheckInInput, []],
    [
      "staff",
      {
        ...BASE,
        method: "staff",
        staff: { contactId: "c_pat", name: "Pat Rivera", role: "volunteer" },
      } as CheckInInput,
      ["note"],
    ],
  ])(
    "%s: add only the event group, even for a member who reaches 18",
    async (_label, input, tail) => {
      const seed = createSeed(NOW);
      seed.contacts.find((c) => c.id === "c_dante")!.custom_fields[
        POINTS_FIELD_ID
      ] = { id: POINTS_FIELD_ID, title: "Points", type: "string", value: "17" };
      const client = new MockTidyClient(seed, () => NOW);
      const order: string[] = [];
      const add = client.addContactToGroup.bind(client);
      const update = client.updateContact.bind(client);
      const note = client.addNote.bind(client);
      vi.spyOn(client, "addContactToGroup").mockImplementation(async (g, c) => {
        order.push(`group:${g}`);
        return add(g, c);
      });
      vi.spyOn(client, "updateContact").mockImplementation(async (c, p) => {
        order.push("points");
        return update(c, p);
      });
      vi.spyOn(client, "addNote").mockImplementation(async (c, t) => {
        order.push("note");
        return note(c, t);
      });

      const result = await checkIn(client, input);

      expect(result).toMatchObject({ status: "checked_in", total: 18 });
      expect(order).toEqual(["group:grp_social_night", "points", ...tail]);
    },
  );
});
