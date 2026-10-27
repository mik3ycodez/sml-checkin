import { NextResponse, type NextRequest } from "next/server";

/**
 * Copies the request's path and query into `x-sml-path` for the server, so the
 * layout (which Next doesn't tell the current path) can give Sign out the page
 * to return to. It only passes the request along: it never redirects, rewrites,
 * reads the session or checks access. Every auth check stays in the pages and
 * actions. Always overwritten, so a client can't send its own, and set through
 * `request` so it goes to the server only, never back to the browser.
 */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-sml-path", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Everything except Next's own files and the brand folder.
  matcher: "/((?!_next|brand).*)",
};
