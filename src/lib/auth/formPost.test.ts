import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { handleFormPost } from "./formPost";

const ORIGIN = "http://localhost:3000";

function post(headers: Record<string, string>, form?: Record<string, string>) {
  return new NextRequest(`${ORIGIN}/x`, {
    method: "POST",
    headers: { host: "localhost:3000", ...headers },
    body: form ? new URLSearchParams(form) : undefined,
  });
}

const SAME_SITE = { "sec-fetch-site": "same-origin" };

describe("handleFormPost", () => {
  it("refuses a cross-site post without running the action", async () => {
    const act = vi.fn();
    const response = await handleFormPost(
      post({ "sec-fetch-site": "cross-site" }, { returnTo: "/me" }),
      act,
    );
    expect(response.status).toBe(403);
    expect(act).not.toHaveBeenCalled();
  });

  it("refuses another origin on older browsers", async () => {
    const act = vi.fn();
    const response = await handleFormPost(
      post({ origin: "https://evil.example" }),
      act,
    );
    expect(response.status).toBe(403);
    expect(act).not.toHaveBeenCalled();
  });

  it("runs the action with the form's fields, then 303s to returnTo", async () => {
    const act = vi.fn();
    const response = await handleFormPost(
      post(SAME_SITE, { theme: "dark", returnTo: "/me" }),
      act,
    );
    expect(act).toHaveBeenCalledTimes(1);
    expect(act.mock.calls[0][0]("theme")).toBe("dark");
    expect(act.mock.calls[0][0]("missing")).toBeNull();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/me`);
  });

  it("goes home for a returnTo on another site or none", async () => {
    const forms: Record<string, string>[] = [
      { returnTo: "//evil.example/" },
      {},
    ];
    for (const form of forms) {
      const response = await handleFormPost(post(SAME_SITE, form), vi.fn());
      expect(response.headers.get("location")).toBe(`${ORIGIN}/`);
    }
  });

  it("treats a post with no form body as having no fields", async () => {
    const act = vi.fn();
    const response = await handleFormPost(post(SAME_SITE), act);
    expect(act.mock.calls[0][0]("returnTo")).toBeNull();
    expect(response.headers.get("location")).toBe(`${ORIGIN}/`);
  });
});
