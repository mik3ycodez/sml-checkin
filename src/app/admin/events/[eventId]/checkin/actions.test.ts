import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => new Map<string, string>());
const cookieStore = vi.hoisted(() => ({
  get: vi.fn((name: string) =>
    jar.has(name) ? { name, value: jar.get(name)! } : undefined,
  ),
  set: vi.fn(),
  delete: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));

// redirect() throws in Next.js; record where it was sent instead.
class Redirected extends Error {
  constructor(readonly url: string) {
    super(`redirect ${url}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirected(url);
  },
}));

import { SESSION_COOKIE, signSession } from "@/lib/auth/session";
import {
  readTapNotice,
  STAFF_NOTICE_COOKIE,
  type TapOutcome,
} from "@/lib/checkin/tapNotice";
import { getTidyClient, TidyError } from "@/lib/tidyhq";
import { staffCheckInAction } from "./actions";

const SECRET = "test-secret-that-is-at-least-32-characters-long";

function signInAs(contactId: string) {
  jar.set(SESSION_COOKIE, signSession(contactId, SECRET, new Date()));
}

/** Posts the form the way the page does, and returns where it redirected. */
async function submit(
  eventId: unknown,
  fields: Record<string, string> = {},
): Promise<string> {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  const error = await staffCheckInAction(eventId, form).catch(
    (e: unknown) => e,
  );
  if (!(error instanceof Redirected)) throw error;
  return error.url;
}

const PAGE = "/admin/events/ev_tonight/checkin";

async function inGroup(contactId: string, group = "grp_social_night") {
  const members = await getTidyClient().listGroupContacts(group);
  return members.map((c) => c.id).includes(contactId);
}

function notice(contactId: string): TapOutcome | null {
  const call = cookieStore.set.mock.calls.find(
    ([name]) => name === STAFF_NOTICE_COOKIE,
  );
  return call
    ? readTapNotice(call[1], { eventId: "ev_tonight", contactId })
    : null;
}

describe("staffCheckInAction", () => {
  beforeEach(() => {
    vi.stubEnv("TIDYHQ_MODE", "mock");
    vi.stubEnv("SESSION_SECRET", SECRET);
    jar.clear();
    cookieStore.set.mockClear();
    cookieStore.delete.mockClear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    delete (globalThis as { __tidy?: unknown }).__tidy;
  });

  it("lets a volunteer check a member in, noting who did it", async () => {
    signInAs("c_pat");
    expect(await submit("ev_tonight", { member: "c_dante" })).toBe(
      `${PAGE}?member=c_dante`,
    );
    expect(await inGroup("c_dante")).toBe(true);
    const dante = await getTidyClient().getContact("c_dante");
    expect(dante.notes[0].text).toContain("by volunteer: Pat Rivera (c_pat)");
    expect(notice("c_dante")).toEqual({ kind: "awarded", points: 1 });
    expect(cookieStore.set).toHaveBeenCalledWith(
      STAFF_NOTICE_COOKIE,
      expect.any(String),
      expect.objectContaining({ httpOnly: true, path: PAGE }),
    );
  });

  it("lets an admin check a member in, noting the admin role", async () => {
    signInAs("c_casey");
    await submit("ev_tonight", { member: "c_dante" });
    const dante = await getTidyClient().getContact("c_dante");
    expect(dante.notes[0].text).toContain("by admin: Casey Moreno (c_casey)");
  });

  it("takes the staff identity from the session, never the form", async () => {
    signInAs("c_pat");
    await submit("ev_tonight", {
      member: "c_dante",
      staff: "c_casey",
      contactId: "c_casey",
      role: "admin",
    });
    const dante = await getTidyClient().getContact("c_dante");
    expect(dante.notes[0].text).toContain("by volunteer: Pat Rivera (c_pat)");
    expect(dante.notes[0].text).not.toContain("c_casey");
  });

  it("refuses a member who is neither a volunteer nor an admin, writing nothing", async () => {
    signInAs("c_dante");
    expect(await submit("ev_tonight", { member: "c_dante" })).toBe(
      "/admin/denied?reason=not_admin&returnTo=%2Fadmin%2Fevents%2Fev_tonight%2Fcheckin",
    );
    expect(await inGroup("c_dante")).toBe(false);
    expect((await getTidyClient().getContact("c_dante")).notes).toEqual([]);
  });

  it("sends a signed-out visitor to sign in, writing nothing", async () => {
    expect(await submit("ev_tonight", { member: "c_dante" })).toMatch(
      /^\/auth\/signin\?returnTo=/,
    );
    expect(await inGroup("c_dante")).toBe(false);
  });

  it.each([
    ["no member", {}],
    ["an empty member", { member: "" }],
  ])("rejects %s", async (_label, fields) => {
    signInAs("c_pat");
    expect(await submit("ev_tonight", fields)).toBe(PAGE);
  });

  it("sends a missing or non-string event id home", async () => {
    signInAs("c_pat");
    expect(await submit("", { member: "c_dante" })).toBe("/");
    expect(await submit({ id: 1 }, { member: "c_dante" })).toBe("/");
  });

  it("writes nothing once check-in has closed: the check-in rules refuse it", async () => {
    signInAs("c_pat");
    expect(await submit("ev_pub_night", { member: "c_dante" })).toBe(
      "/admin/events/ev_pub_night/checkin?member=c_dante",
    );
    expect(await inGroup("c_dante", "grp_pub_night")).toBe(false);
    expect((await getTidyClient().getContact("c_dante")).notes).toEqual([]);
  });

  it("says nothing was saved if TidyHQ fails reading the event", async () => {
    signInAs("c_pat");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(getTidyClient(), "getEvent").mockRejectedValue(
      new TidyError(503, "down"),
    );
    expect(await submit("ev_tonight", { member: "c_dante" })).toBe(
      `${PAGE}?member=c_dante&problem=nothing_saved`,
    );
  });

  it("keeps the search the volunteer was on", async () => {
    signInAs("c_pat");
    expect(await submit("ev_tonight", { member: "c_dante", q: "Dan" })).toBe(
      `${PAGE}?member=c_dante&q=Dan`,
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(getTidyClient(), "addContactToGroup").mockRejectedValue(
      new TidyError(503, "down"),
    );
    expect(await submit("ev_tonight", { member: "c_riley", q: "Ri" })).toBe(
      `${PAGE}?member=c_riley&problem=nothing_saved&q=Ri`,
    );
  });

  it("tells the page about a repeat, with no second point", async () => {
    signInAs("c_pat");
    await submit("ev_tonight", { member: "c_dante" });
    cookieStore.set.mockClear();
    await submit("ev_tonight", { member: "c_dante" });
    expect(notice("c_dante")).toEqual({ kind: "repeat" });
    expect((await getTidyClient().getContact("c_dante")).notes).toHaveLength(1);
  });

  it("carries no membership notice or reward details to the page", async () => {
    signInAs("c_pat");
    await submit("ev_tonight", { member: "c_avery" }); // balance due
    await submit("ev_tonight", { member: "c_riley" }); // reaches 18
    for (const [name, value] of cookieStore.set.mock.calls) {
      if (name === STAFF_NOTICE_COOKIE) {
        expect(value).not.toMatch(/balance|club|grace|[&?]m=|[&?]q=/);
      }
    }
  });

  it("says nothing was saved when TidyHQ fails before the group add", async () => {
    signInAs("c_pat");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(getTidyClient(), "addContactToGroup").mockRejectedValue(
      new TidyError(503, "down"),
    );
    expect(await submit("ev_tonight", { member: "c_dante" })).toBe(
      `${PAGE}?member=c_dante&problem=nothing_saved`,
    );
    expect(await inGroup("c_dante")).toBe(false);
  });

  it("says the point didn't save when only the points write fails", async () => {
    signInAs("c_pat");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(getTidyClient(), "updateContact").mockRejectedValue(
      new TidyError(503, "down"),
    );
    expect(await submit("ev_tonight", { member: "c_dante" })).toBe(
      `${PAGE}?member=c_dante`,
    );
    expect(await inGroup("c_dante")).toBe(true);
    expect(notice("c_dante")).toEqual({ kind: "point_not_saved" });
  });

  it("lets other errors through, so bugs aren't hidden", async () => {
    signInAs("c_pat");
    vi.spyOn(getTidyClient(), "addContactToGroup").mockRejectedValue(
      new TypeError("bug"),
    );
    await expect(submit("ev_tonight", { member: "c_dante" })).rejects.toThrow(
      "bug",
    );
  });
});
