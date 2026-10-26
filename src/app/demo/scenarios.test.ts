import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { safeReturnTo } from "@/lib/auth/returnTo";
import { findReward, rewardMessage } from "@/lib/rewards";
import { contactName } from "@/lib/tidyhq/contactName";
import { searchMembers } from "@/lib/tidyhq/contacts";
import { MockTidyClient } from "@/lib/tidyhq/mock/MockTidyClient";
import {
  createSeed,
  MOCK_ADMIN_GROUP_ID,
  MOCK_HELPER_GROUP_ID,
} from "@/lib/tidyhq/mock/seed";
import { ADMIN_PATH, adminEventPath } from "../admin/paths";
import { checkinPath, ME_PATH, staffCheckinPath } from "../memberPaths";
import { SCENARIOS, targetPath, type Target } from "./scenarios";
import { screenText } from "./screenText";

const seed = createSeed();
const allParts = SCENARIOS.flatMap((s) => s.parts);

describe("the demo scenarios", () => {
  it("are numbered 1 to 9 in order, each with something to do and see", () => {
    expect(SCENARIOS.map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (const scenario of SCENARIOS) {
      expect(scenario.title).not.toBe("");
      expect(scenario.parts.length).toBeGreaterThan(0);
      expect(scenario.alreadyRun).not.toBe("");
      for (const part of scenario.parts) {
        expect(part.steps.length).toBeGreaterThan(0);
        expect(part.see.length).toBeGreaterThan(0);
      }
    }
  });

  it("only name members that exist in the seed, spelled as the sign-in list shows them", () => {
    for (const part of allParts) {
      const contact = seed.contacts.find((c) => c.id === part.memberId);
      expect(contact, part.memberId).toBeDefined();
      expect(part.memberName).toBe(contactName(contact!));
    }
  });

  it("only name events that exist in the seed", () => {
    const targets: Target[] = allParts.map((p) => p.target);
    for (const target of targets) {
      if (!("eventId" in target)) continue;
      expect(
        seed.events.some((e) => e.id === target.eventId),
        target.eventId,
      ).toBe(true);
    }
  });

  it("send each member to the page the scenario is about, built by the path helpers", () => {
    expect(targetPath({ kind: "checkin", eventId: "ev_tonight" })).toBe(
      checkinPath("ev_tonight"),
    );
    expect(targetPath({ kind: "me" })).toBe(ME_PATH);
    expect(targetPath({ kind: "admin" })).toBe(ADMIN_PATH);
    expect(targetPath({ kind: "adminEvent", eventId: "ev_tonight" })).toBe(
      adminEventPath("ev_tonight"),
    );
    expect(targetPath({ kind: "staff", eventId: "ev_tonight" })).toBe(
      staffCheckinPath("ev_tonight"),
    );
  });

  it("use start paths the sign-out route accepts unchanged", () => {
    for (const part of allParts) {
      const path = targetPath(part.target);
      expect(safeReturnTo(path, "/fallback"), path).toBe(path);
    }
  });

  it("sign in as the right kind of person for each page", () => {
    const groups = seed.groupMembers;
    const admins = groups[MOCK_ADMIN_GROUP_ID];
    const volunteers = groups[MOCK_HELPER_GROUP_ID];
    for (const part of allParts) {
      const { kind } = part.target;
      if (kind === "admin" || kind === "adminEvent") {
        expect(admins, part.memberId).toContain(part.memberId);
      }
      if (kind === "staff") {
        expect([...admins, ...volunteers], part.memberId).toContain(
          part.memberId,
        );
      }
    }
  });

  it("only search for terms that find exactly the member named", async () => {
    const client = new MockTidyClient(createSeed());
    const searches = allParts.flatMap((p) => p.searches ?? []);
    expect(searches.length).toBeGreaterThan(0);
    for (const { term, memberId } of searches) {
      const found = await searchMembers(client, term);
      expect(found.status, term).toBe("ok");
      if (found.status !== "ok") continue;
      expect(
        found.contacts.map((c) => c.id),
        term,
      ).toEqual([memberId]);
    }
  });

  it("name a fallback member for scenario 7's live update that nothing else checks in", () => {
    const fallback = seed.contacts.find((c) => c.id === "c_marcus")!;
    const alreadyRun = SCENARIOS.find((s) => s.number === 7)!.alreadyRun;
    expect(alreadyRun).toContain(contactName(fallback));
    expect(seed.groupMembers.grp_social_night).not.toContain(fallback.id);
    const checkedInAtSocialNight = allParts.filter(
      (p) =>
        p.memberId === fallback.id &&
        "eventId" in p.target &&
        p.target.eventId === "ev_tonight",
    );
    expect(checkedInAtSocialNight).toEqual([]);
  });

  it("say what the staff screen shows when Jordan is already checked in", () => {
    const alreadyRun = SCENARIOS.find((s) => s.number === 8)!.alreadyRun;
    expect(alreadyRun).toContain(`"Search again"`);
    expect(alreadyRun).toMatch(/2 points/);
  });

  it("don't claim Pop-up Meetup's check-in window is open (it closes a few hours after a Restart)", () => {
    const popUp = SCENARIOS.find((s) => s.number === 5)!.parts[0];
    expect(popUp.target).toEqual({ kind: "checkin", eventId: "ev_no_group" });
    expect(popUp.steps.join(" ")).not.toMatch(/window is open/i);
  });

  it("cover the volunteer privacy comparison: Pat and Casey search the same member", () => {
    const searchesBy = (memberId: string) =>
      allParts
        .filter((p) => p.memberId === memberId)
        .flatMap((p) => p.searches ?? [])
        .map((s) => s.memberId);
    expect(searchesBy("c_pat")).toContain("c_lee");
    expect(searchesBy("c_casey")).toEqual(
      expect.arrayContaining(["c_lee", "c_kai"]),
    );
  });
});

// Every screen text the page quotes (in "straight double quotes") must still
// be in the app's source, outside comments (`screenText`), so rewording a screen fails here instead of leaving
// the walkthrough wrong. Text built from a reward's name is checked against
// the function that builds it.
describe("the screen text the scenarios quote", () => {
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

  const normalize = (text: string) =>
    text
      .replaceAll("&apos;", "'")
      .replaceAll("&quot;", '"')
      .replace(/\s+/g, " ");

  const source = normalize(
    sourceFiles(SRC)
      .filter((f) => !f.includes(join("app", "demo")))
      .map((f) => screenText(readFileSync(f, "utf8")))
      .join("\n"),
  );

  const reward = findReward("club_colors")!;
  const built = [
    rewardMessage(reward, { kind: "qualified" }, "current"),
    rewardMessage(reward, { kind: "issued" }, "current"),
    rewardMessage(reward, { kind: "progress", remaining: 18 }, "current"),
  ];

  const quoted = SCENARIOS.flatMap((s) => [
    ...s.parts.flatMap((p) => [...p.steps, ...p.see]),
    s.alreadyRun,
  ]).flatMap((text) => [...text.matchAll(/"([^"]+)"/g)].map((m) => m[1]));

  it("quotes something (guards against checking nothing)", () => {
    expect(quoted.length).toBeGreaterThan(20);
  });

  it("is all still in the source", () => {
    const missing = quoted.filter(
      (text) => !source.includes(normalize(text)) && !built.includes(text),
    );
    expect(missing).toEqual([]);
  });
});
