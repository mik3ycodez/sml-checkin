import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ColorsOwed } from "@/lib/admin/colorsOwed";
import { ColorsReportScreen } from "./screens";

function html(report: ColorsOwed | null) {
  return renderToStaticMarkup(
    createElement(ColorsReportScreen, { report, name: "Casey" }),
  );
}
function text(report: ColorsOwed | null) {
  return html(report)
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const report: ColorsOwed = {
  ready: [
    {
      contactId: "a",
      name: "Ann Ready",
      points: 18,
      standing: "current",
      email: "ann@example.com",
    },
    {
      contactId: "b",
      name: "Bo Ready",
      points: 20,
      standing: "current",
      email: null,
    },
  ],
  renewFirst: [
    {
      contactId: "c",
      name: "Cy Grace",
      points: 19,
      standing: "grace",
      email: null,
    },
    {
      contactId: "d",
      name: "Di Due",
      points: 18,
      standing: "balance_due",
      email: "di@example.com",
    },
  ],
  needsChecking: [
    { contactId: "e", name: "Ed Odd", problem: "points", email: null },
  ],
};

describe("ColorsReportScreen", () => {
  it("shows the three groups in order, each with a count", () => {
    const shown = text(report);
    const ready = shown.indexOf("Ready to receive colors (2)");
    const renew = shown.indexOf("Needs to renew or pay first (2)");
    const check = shown.indexOf("Needs checking (1)");
    expect(ready).toBeGreaterThan(-1);
    expect(renew).toBeGreaterThan(ready);
    expect(check).toBeGreaterThan(renew);
  });

  it("shows each member's points and standing", () => {
    const shown = text(report);
    expect(shown).toContain("Ann Ready");
    expect(shown).toContain("18 points");
    expect(shown).toMatch(/Cy Grace.*19 points.*grace period/);
    expect(shown).toMatch(/Di Due.*balance due/i);
  });

  it("shows the email, or the TidyHQ contact id when there is none", () => {
    const shown = text(report);
    expect(shown).toContain("ann@example.com");
    expect(shown).toMatch(/Bo Ready.*TidyHQ contact b/);
    expect(shown).toMatch(/Cy Grace.*TidyHQ contact c/);
    expect(shown).toMatch(/Ed Odd.*TidyHQ contact e/);
  });

  it("says why a member needs checking", () => {
    expect(text(report)).toMatch(/Ed Odd.*points/i);
  });

  it("says TidyHQ is the official record and the app never marks colors issued", () => {
    expect(text(report)).toMatch(/TidyHQ is the official record/);
  });

  it("shows empty groups as empty, with a zero count", () => {
    const shown = text({ ready: [], renewFirst: [], needsChecking: [] });
    expect(shown).toContain("Ready to receive colors (0)");
    expect(shown).toContain("Needs to renew or pay first (0)");
    expect(shown).toContain("Needs checking (0)");
  });

  it("says temporarily unavailable with a retry link, and no lists, when TidyHQ failed", () => {
    const shown = text(null);
    expect(shown).toContain("temporarily unavailable");
    expect(html(null)).toMatch(/<a[^>]*href="\/admin\/reports\/colors"/);
    expect(shown).not.toContain("Ready to receive colors");
    expect(shown).not.toContain("(0)");
  });

  it("links back to the admin home", () => {
    expect(html(report)).toMatch(/<a[^>]*href="\/admin"/);
  });
});
