import { NextRequest, NextResponse } from "next/server";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { config, proxy } from "./proxy";

function run(url: string, headers: Record<string, string> = {}) {
  return proxy(new NextRequest(url, { headers }));
}

// NextResponse.next({ request }) reports the headers it forwards to the
// server as x-middleware-request-* and lists them in x-middleware-override-headers.
function forwarded(response: Response, name: string): string | null {
  return response.headers.get(`x-middleware-request-${name}`);
}

describe("proxy", () => {
  it("passes the path and query to the server in x-sml-path", () => {
    const response = run("http://localhost:3000/checkin/ev_tonight?a=1");
    expect(forwarded(response, "x-sml-path")).toBe("/checkin/ev_tonight?a=1");
  });

  it("does not send x-sml-path to the browser", () => {
    const response = run("http://localhost:3000/me");
    expect(response.headers.get("x-sml-path")).toBeNull();
  });

  it("overwrites an x-sml-path the client sent", () => {
    const response = run("http://localhost:3000/me", {
      "x-sml-path": "/admin",
    });
    expect(forwarded(response, "x-sml-path")).toBe("/me");
  });

  it("only passes the request along: no redirect, rewrite or error", () => {
    for (const url of [
      "http://localhost:3000/",
      "http://localhost:3000/admin",
      "http://localhost:3000/checkin/x?next=//evil.com",
    ]) {
      const response = run(url);
      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
  });

  it("returns a NextResponse.next() response", () => {
    expect(run("http://localhost:3000/")).toBeInstanceOf(NextResponse);
  });

  it("skips Next's own files and the brand folder", () => {
    const matcher = config.matcher;
    const re = new RegExp(`^${matcher}$`);
    expect(re.test("/me")).toBe(true);
    expect(re.test("/checkin/ev_tonight")).toBe(true);
    expect(re.test("/_next/static/chunk.js")).toBe(false);
    expect(re.test("/brand/sml-logo-black.png")).toBe(false);
  });

  it("is anchored: only the real folders are skipped, not lookalikes", () => {
    const re = new RegExp(`^${config.matcher}$`);
    expect(re.test("/brandx")).toBe(true);
    expect(re.test("/_nextfoo")).toBe(true);
    expect(re.test("/brand/missing.png")).toBe(false);
  });

  it("skips files with an extension, which never render the layout", () => {
    const re = new RegExp(`^${config.matcher}$`);
    for (const path of [
      "/favicon.ico",
      "/mock/marcus.svg",
      "/manifest.webmanifest",
    ]) {
      expect(re.test(path)).toBe(false);
    }
  });

  // The matcher skips any path with a dot, so no page may have one.
  it("matches every page route: no route segment contains a dot", () => {
    const dirs: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        dirs.push(entry.name);
        walk(join(dir, entry.name));
      }
    };
    walk(join(__dirname, "app"));
    expect(dirs.filter((name) => name.includes("."))).toEqual([]);
    const re = new RegExp(`^${config.matcher}$`);
    for (const id of ["ev_tonight", "ev_pub_night", "12345"]) {
      expect(re.test(`/checkin/${id}`)).toBe(true);
      expect(re.test(`/admin/events/${id}/checkin`)).toBe(true);
    }
  });
});
