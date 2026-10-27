import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A small self-contained `server.js`, so a deploy uploads a few files, not
  // all of node_modules. `npm run build:standalone` also copies the static
  // files in. See docs/plans/milestone-6.md.
  output: "standalone",
  // Browsers ask for /favicon.ico on their own, whatever the page links to. A
  // rewrite serves the locked icon from public/brand without a route (which
  // would be dynamic) or a copy outside the lock.
  async rewrites() {
    return [{ source: "/favicon.ico", destination: "/brand/sml-icon-192.png" }];
  },
  // No Cache Components: every page is dynamic, and it would force <Suspense>
  // around them, which shows "Loading…" forever if scripts fail. See
  // .claude/rules/app-pages.md.
};

export default nextConfig;
