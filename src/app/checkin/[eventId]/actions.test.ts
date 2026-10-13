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
import { AWARD_NOTICE_COOKIE, readAwardNotice } from "@/lib/checkin/awardNotice";
import { getTidyClient } from "@/lib/tidyhq";
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

/** Points the action told the result page it just awarded, or null. */
function awardNotice(eventId: string, contactId: string): number | null {
  const call = cookieStore.set.mock.calls.find(
    ([name]) => name === AWARD_NOTICE_COOKIE,
  );
  return call ? readAwardNotice(call[1], { eventId, contactId }) : null;
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
    vi.unstubAllEnvs();
    delete (globalThis as { __tidy?: unknown }).__tidy;
  });

  it("checks the member in and shows the result", async () => {
    signInAs("c_dante");
    expect(await submit("ev_tonight")).toBe("/checkin/ev_tonight/result");
    const members = await getTidyClient().listGroupContacts("grp_social_night");
    expect(members.map((c) => c.id)).toContain("c_dante");
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
    expect(awardNotice("ev_tonight", "c_dante")).toBe(1);
    expect(cookieStore.set).toHaveBeenCalledWith(
      AWARD_NOTICE_COOKIE,
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        path: "/checkin/ev_tonight/result",
      }),
    );
  });

  it("doesn't claim a point when already checked in", async () => {
    signInAs("c_dante");
    await submit("ev_tonight");
    cookieStore.set.mockClear();
    await submit("ev_tonight");
    expect(awardNotice("ev_tonight", "c_dante")).toBeNull();
    // Clears the first tap's note, so the result page doesn't show it again.
    expect(cookieStore.delete).toHaveBeenCalledWith({
      name: AWARD_NOTICE_COOKIE,
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
});
