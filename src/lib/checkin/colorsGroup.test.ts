import { afterEach, describe, expect, it, vi } from "vitest";
import { REWARDS } from "../points";
import {
  COLORS_ISSUED_FIELD_ID,
  POINTS_FIELD_ID,
} from "../tidyhq/customFields";
import { TidyError } from "../tidyhq/errors";
import { MockTidyClient } from "../tidyhq/mock/MockTidyClient";
import { createSeed, MOCK_COLORS_GROUP_ID } from "../tidyhq/mock/seed";
import { checkIn } from "./checkIn";
import { colorsGroup } from "./colorsGroup";

const NOW = new Date("2026-10-12T18:00:00Z");
const COLORS = { id: MOCK_COLORS_GROUP_ID };
const THRESHOLD = REWARDS.find((r) => r.id === "club_colors")!.pointsRequired;

function setField(
  seed: ReturnType<typeof createSeed>,
  contactId: string,
  fieldId: string,
  value: string,
) {
  seed.contacts.find((c) => c.id === contactId)!.custom_fields[fieldId] = {
    id: fieldId,
    title: fieldId,
    type: "string",
    value,
  };
}

/** Dante, a current member, starting at `points` (and optionally edited). */
function clientAt(
  points: number,
  edit?: (seed: ReturnType<typeof createSeed>) => void,
) {
  const seed = createSeed(NOW);
  setField(seed, "c_dante", POINTS_FIELD_ID, String(points));
  edit?.(seed);
  return new MockTidyClient(seed, () => NOW);
}

const input = {
  eventId: "ev_tonight",
  contactId: "c_dante",
  now: NOW,
  colorsGroup: COLORS,
} as const;

const staffInput = {
  ...input,
  method: "staff",
  staff: { contactId: "c_pat", name: "Pat Rivera", role: "volunteer" },
} as const;

async function inColors(client: MockTidyClient) {
  return (await client.listGroupContacts(MOCK_COLORS_GROUP_ID)).map(
    (c) => c.id,
  );
}

afterEach(() => vi.restoreAllMocks());

describe("colorsGroup setting", () => {
  it("reads COLORS_GROUP_ID like the other group settings", () => {
    expect(colorsGroup({ COLORS_GROUP_ID: " 222071 " }, "live")).toEqual({
      id: "222071",
    });
    expect(colorsGroup({}, "mock")).toEqual({ id: MOCK_COLORS_GROUP_ID });
    expect(colorsGroup({}, "live")).toEqual({ problem: "not_configured" });
    expect(colorsGroup({ COLORS_GROUP_ID: "12/34" }, "live")).toEqual({
      problem: "invalid",
    });
  });
});

describe("adding to the colors group at check-in", () => {
  it("adds a member whose point brings them to the threshold", async () => {
    const client = clientAt(THRESHOLD - 1);
    expect(await checkIn(client, input)).toMatchObject({
      status: "checked_in",
    });
    expect(await inColors(client)).toEqual(["c_dante"]);
  });

  it("follows the threshold in REWARDS, not a fixed 18", async () => {
    const reward = REWARDS.find((r) => r.id === "club_colors")!;
    const original = reward.pointsRequired;
    try {
      (reward as { pointsRequired: number }).pointsRequired = 5;
      const low = clientAt(4);
      await checkIn(low, input);
      expect(await inColors(low)).toEqual(["c_dante"]);

      (reward as { pointsRequired: number }).pointsRequired = 30;
      const high = clientAt(17);
      await checkIn(high, input);
      expect(await inColors(high)).toEqual([]);
    } finally {
      (reward as { pointsRequired: number }).pointsRequired = original;
    }
  });

  it("adds a member already over the threshold (self-healing)", async () => {
    const client = clientAt(THRESHOLD + 5);
    await checkIn(client, input);
    expect(await inColors(client)).toEqual(["c_dante"]);
  });

  it("does not add a member still under the threshold", async () => {
    const client = clientAt(THRESHOLD - 2);
    await checkIn(client, input);
    expect(await inColors(client)).toEqual([]);
  });

  it("does not add a member whose colors are issued", async () => {
    const client = clientAt(THRESHOLD, (seed) =>
      setField(seed, "c_dante", COLORS_ISSUED_FIELD_ID, "yes"),
    );
    await checkIn(client, input);
    expect(await inColors(client)).toEqual([]);
  });

  it("skips and logs when the issued field is unreadable", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = clientAt(THRESHOLD, (seed) =>
      setField(seed, "c_dante", COLORS_ISSUED_FIELD_ID, "maybe"),
    );
    expect(await checkIn(client, input)).toMatchObject({
      status: "checked_in",
    });
    expect(await inColors(client)).toEqual([]);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("colors"),
      expect.objectContaining({
        contactId: "c_dante",
        reason: "issued_unreadable",
      }),
    );
  });

  it("does not write a member already in the group again", async () => {
    const client = clientAt(THRESHOLD, (seed) => {
      seed.groupMembers[MOCK_COLORS_GROUP_ID] = ["c_dante"];
    });
    const add = vi.spyOn(client, "addContactToGroup");
    await checkIn(client, input);
    expect(add).not.toHaveBeenCalledWith(MOCK_COLORS_GROUP_ID, "c_dante");
  });

  it("touches nothing on an already-checked-in tap", async () => {
    const client = clientAt(THRESHOLD, (seed) => {
      seed.groupMembers.grp_social_night = ["c_dante"];
    });
    const add = vi.spyOn(client, "addContactToGroup");
    const read = vi.spyOn(client, "listGroupContacts");
    expect(await checkIn(client, input)).toMatchObject({
      status: "already_checked_in",
    });
    expect(add).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalledWith(MOCK_COLORS_GROUP_ID);
  });

  it("adds for a staff check-in too", async () => {
    const client = clientAt(THRESHOLD - 1);
    await checkIn(client, staffInput);
    expect(await inColors(client)).toEqual(["c_dante"]);
  });

  it("skips and logs when the points write failed, with the member still in the event group", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = clientAt(THRESHOLD - 1);
    vi.spyOn(client, "updateContact").mockRejectedValue(
      new TidyError(503, "down"),
    );
    await expect(checkIn(client, input)).rejects.toMatchObject({
      step: "points_write",
    });
    expect(await inColors(client)).toEqual([]);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("colors"),
      expect.objectContaining({
        contactId: "c_dante",
        reason: "points_not_written",
      }),
    );
  });

  it.each([
    ["unset", { problem: "not_configured" }],
    ["invalid", { problem: "invalid" }],
  ] as const)(
    "skips and logs when COLORS_GROUP_ID is %s, without failing",
    async (_label, setting) => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      const client = clientAt(THRESHOLD);
      const add = vi.spyOn(client, "addContactToGroup");
      expect(
        await checkIn(client, { ...input, colorsGroup: setting }),
      ).toMatchObject({ status: "checked_in", total: THRESHOLD + 1 });
      expect(add).toHaveBeenCalledTimes(1); // the event group only
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining("colors"),
        expect.objectContaining({
          contactId: "c_dante",
          reason: `group_${setting.problem}`,
        }),
      );
    },
  );

  it("skips and logs when the already-in-group read fails, keeping the point", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = clientAt(THRESHOLD);
    const real = client.listGroupContacts.bind(client);
    vi.spyOn(client, "listGroupContacts").mockImplementation(async (id) => {
      if (id === MOCK_COLORS_GROUP_ID) throw new TidyError(503, "down");
      return real(id);
    });
    const add = vi.spyOn(client, "addContactToGroup");
    expect(await checkIn(client, input)).toMatchObject({
      status: "checked_in",
      total: THRESHOLD + 1,
    });
    expect(add).not.toHaveBeenCalledWith(MOCK_COLORS_GROUP_ID, "c_dante");
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("colors"),
      expect.objectContaining({ contactId: "c_dante", reason: "read_failed" }),
    );
  });

  it("logs a failed add, still checks in, leaves points alone and still writes the staff note", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = clientAt(THRESHOLD - 1);
    const real = client.addContactToGroup.bind(client);
    vi.spyOn(client, "addContactToGroup").mockImplementation(
      async (groupId, contactId) => {
        if (groupId === MOCK_COLORS_GROUP_ID) throw new TidyError(500, "boom");
        return real(groupId, contactId);
      },
    );
    expect(await checkIn(client, staffInput)).toMatchObject({
      status: "checked_in",
      total: THRESHOLD,
    });
    const dante = await client.getContact("c_dante");
    expect(dante.custom_fields[POINTS_FIELD_ID].value).toBe(String(THRESHOLD));
    expect(dante.notes).toHaveLength(1);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("colors"),
      expect.objectContaining({ contactId: "c_dante", reason: "add_failed" }),
    );
  });

  it("logs the contact id and reason only", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = clientAt(THRESHOLD, (seed) =>
      setField(seed, "c_dante", COLORS_ISSUED_FIELD_ID, "maybe"),
    );
    await checkIn(client, input);
    const colorsLogs = log.mock.calls.filter(([m]) =>
      String(m).includes("colors"),
    );
    expect(colorsLogs).toHaveLength(1);
    expect(Object.keys(colorsLogs[0][1]).sort()).toEqual([
      "contactId",
      "reason",
    ]);
  });

  it("writes in order: event group, points, colors group, staff note", async () => {
    const client = clientAt(THRESHOLD - 1);
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
    await checkIn(client, staffInput);
    expect(order).toEqual([
      "group:grp_social_night",
      "points",
      `group:${MOCK_COLORS_GROUP_ID}`,
      "note",
    ]);
  });
});
