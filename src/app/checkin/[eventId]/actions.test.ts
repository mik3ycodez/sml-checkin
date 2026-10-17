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
  TAP_NOTICE_COOKIE,
  type TapOutcome,
} from "@/lib/checkin/tapNotice";
import { getTidyClient, TidyError } from "@/lib/tidyhq";
import { CHECKIN_BUDGET_MS, remainingMs } from "@/lib/tidyhq/budget";
import { checkInAction } from "./actions";

const SECRET = "test-secret-that-is-at-least-32-characters-long";

function signInAs(contactId: string) {
  jar.set(SESSION_COOKIE, signSession(contactId, SECRET, new Date()));
}

/** Runs the action the way a form post does, and returns where it redirected. */
async function submit(eventId: unknown): Promise<string> {
  const error = await checkInAction(eventId).catch((e: unknown) => e);
  if (!(error instanceof Redirected)) throw error;
  return error.url;
}

/** What the action told the result page about this tap, or null. */
function tapNotice(eventId: string, contactId: string): TapOutcome | null {
  const call = cookieStore.set.mock.calls.find(
    ([name]) => name === TAP_NOTICE_COOKIE,
  );
  return call ? readTapNotice(call[1], { eventId, contactId }) : null;
}

function sessionReissued() {
  return cookieStore.set.mock.calls.some(([name]) => name === SESSION_COOKIE);
}

describe("checkInAction", () => {
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

  it("checks the member in and shows the result", async () => {
    signInAs("c_dante");
    expect(await submit("ev_tonight")).toBe("/checkin/ev_tonight/result");
    const members = await getTidyClient().listGroupContacts("grp_social_night");
    expect(members.map((c) => c.id)).toContain("c_dante");
  });

  it("runs the whole tap inside one time budget", async () => {
    signInAs("c_dante");
    const client = getTidyClient();
    const real = client.getEvent.bind(client);
    const seen: Array<number | null> = [];
    vi.spyOn(client, "getEvent").mockImplementation(async (id) => {
      seen.push(remainingMs());
      return real(id);
    });
    await submit("ev_tonight");
    expect(seen.length).toBeGreaterThan(0);
    for (const left of seen) {
      expect(left).not.toBeNull();
      expect(left).toBeLessThanOrEqual(CHECKIN_BUDGET_MS);
    }
  });

  it("extends the session after a check-in", async () => {
    signInAs("c_dante");
    await submit("ev_tonight");
    expect(cookieStore.set).toHaveBeenCalledWith(
      SESSION_COOKIE,
      expect.any(String),
      expect.objectContaining({ httpOnly: true, maxAge: 90 * 24 * 60 * 60 }),
    );
  });

  it("extends the session when already checked in", async () => {
    signInAs("c_dante");
    await submit("ev_tonight");
    cookieStore.set.mockClear();
    expect(await submit("ev_tonight")).toBe("/checkin/ev_tonight/result");
    expect(sessionReissued()).toBe(true);
  });

  it("tells the result page how many points it just awarded", async () => {
    signInAs("c_dante");
    await submit("ev_tonight");
    expect(tapNotice("ev_tonight", "c_dante")).toEqual({
      kind: "awarded",
      points: 1,
    });
    expect(cookieStore.set).toHaveBeenCalledWith(
      TAP_NOTICE_COOKIE,
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        path: "/checkin/ev_tonight/result",
      }),
    );
  });

  it("tells the result page when this point qualified them for club colors", async () => {
    signInAs("c_riley");
    await submit("ev_tonight");
    expect(tapNotice("ev_tonight", "c_riley")).toEqual({
      kind: "awarded",
      points: 1,
      qualified: [{ rewardId: "club_colors", standing: "current" }],
    });
  });

  it("tells the result page about a repeat tap, with no point", async () => {
    signInAs("c_dante");
    await submit("ev_tonight");
    cookieStore.set.mockClear();
    await submit("ev_tonight");
    // Replaces the first tap's note, so the result page doesn't say "+1" again.
    expect(tapNotice("ev_tonight", "c_dante")).toEqual({ kind: "repeat" });
  });

  it("clears an earlier tap's note when the check-in is refused", async () => {
    signInAs("c_lee");
    await submit("ev_tonight");
    expect(tapNotice("ev_tonight", "c_lee")).toBeNull();
    expect(cookieStore.delete).toHaveBeenCalledWith({
      name: TAP_NOTICE_COOKIE,
      path: "/checkin/ev_tonight/result",
    });
  });

  it("sends a member whose contact is gone from TidyHQ to sign in again", async () => {
    signInAs("c_nobody");
    expect(await submit("ev_tonight")).toBe(
      "/auth/signin?returnTo=%2Fcheckin%2Fev_tonight",
    );
    expect(sessionReissued()).toBe(false);
  });

  it("doesn't extend the session when the check-in is refused", async () => {
    signInAs("c_lee");
    expect(await submit("ev_tonight")).toBe("/checkin/ev_tonight/result");
    expect(sessionReissued()).toBe(false);
  });

  it("sends a member without a session to sign in, then back here", async () => {
    expect(await submit("ev_tonight")).toBe(
      "/auth/signin?returnTo=%2Fcheckin%2Fev_tonight",
    );
    const members = await getTidyClient().listGroupContacts("grp_social_night");
    expect(members.map((c) => c.id)).not.toContain("c_dante");
  });

  it("ignores a forged session", async () => {
    jar.set(SESSION_COOKIE, signSession("c_dante", "x".repeat(40), new Date()));
    expect(await submit("ev_tonight")).toMatch(/^\/auth\/signin/);
  });

  it("sends an unknown event back to the check-in page", async () => {
    signInAs("c_dante");
    expect(await submit("ev_nope")).toBe("/checkin/ev_nope");
    expect(sessionReissued()).toBe(false);
  });

  it("escapes the event id in the redirect", async () => {
    signInAs("c_dante");
    expect(await submit("a/../b?x")).toBe("/checkin/a%2F..%2Fb%3Fx");
  });

  it("sends a missing or non-string event id home", async () => {
    signInAs("c_dante");
    expect(await submit("")).toBe("/");
    expect(await submit({ id: "ev_tonight" })).toBe("/");
  });

  it("asks TidyHQ again after an expired member renews", async () => {
    signInAs("c_lee");
    await submit("ev_tonight");
    const before = await getTidyClient().listGroupContacts("grp_social_night");
    expect(before.map((c) => c.id)).not.toContain("c_lee");

    // Lee renews in TidyHQ; the mock now reports an active membership.
    const client = getTidyClient();
    const getMemberships = client.getMemberships.bind(client);
    client.getMemberships = async (id) =>
      (await getMemberships(id)).map((m) => ({
        ...m,
        state: "activated",
        status: "Activated",
        end_date: "2099-12-31",
      }));

    cookieStore.set.mockClear();
    expect(await submit("ev_tonight")).toBe("/checkin/ev_tonight/result");
    const after = await getTidyClient().listGroupContacts("grp_social_night");
    expect(after.map((c) => c.id)).toContain("c_lee");
    expect(tapNotice("ev_tonight", "c_lee")).toEqual({
      kind: "awarded",
      points: 1,
    });
  });

  describe("when TidyHQ fails", () => {
    const unavailable = () => new TidyError(503, "TidyHQ unavailable");

    function failPointsWrite() {
      getTidyClient().updateContact = async () => {
        throw unavailable();
      };
    }

    function failGroupAdd() {
      getTidyClient().addContactToGroup = async () => {
        throw unavailable();
      };
    }

    beforeEach(() => {
      vi.spyOn(console, "error").mockImplementation(() => {});
    });

    it("shows a friendly problem page if the member wasn't checked in", async () => {
      signInAs("c_dante");
      failGroupAdd();
      expect(await submit("ev_tonight")).toBe("/checkin/ev_tonight/problem");
      expect(tapNotice("ev_tonight", "c_dante")).toBeNull();
    });

    it("tells a member checked in without their point to see a volunteer", async () => {
      // Not "try again": they're in the group, so a retry would only say
      // "already checked in" and the lost point would go unnoticed.
      signInAs("c_dante");
      failPointsWrite();
      expect(await submit("ev_tonight")).toBe("/checkin/ev_tonight/result");
      expect(tapNotice("ev_tonight", "c_dante")).toEqual({
        kind: "point_not_saved",
      });
      expect(sessionReissued()).toBe(true);
    });

    it("keeps a grace-period member's renewal message when the point didn't save", async () => {
      signInAs("c_robin");
      failPointsWrite();
      await submit("ev_tonight");
      expect(tapNotice("ev_tonight", "c_robin")).toMatchObject({
        kind: "point_not_saved",
        membershipNotice: { kind: "grace" },
      });
    });

    it("logs the event, member, failed step and TidyHQ's error", async () => {
      signInAs("c_dante");
      failPointsWrite();
      await submit("ev_tonight");
      expect(console.error).toHaveBeenCalledWith("check-in failed", {
        eventId: "ev_tonight",
        contactId: "c_dante",
        step: "points_write",
        tidyStatus: 503,
        message: "TidyHQ unavailable",
      });
    });

    it("never logs the session cookie", async () => {
      signInAs("c_dante");
      failPointsWrite();
      await submit("ev_tonight");
      expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
        jar.get(SESSION_COOKIE),
      );
    });

    it("lets a bug that isn't a TidyHQ failure reach the error page", async () => {
      signInAs("c_dante");
      const bug = new TypeError("bad patch");
      getTidyClient().updateContact = async () => {
        throw bug;
      };
      await expect(checkInAction("ev_tonight")).rejects.toBe(bug);
    });
  });
});
