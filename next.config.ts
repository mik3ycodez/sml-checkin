import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A small self-contained `server.js`, so a deploy uploads a few files, not
  // all of node_modules. `npm run build:standalone` also copies the static
  // files in. See docs/plans/milestone-6.md.
  output: "standalone",
  // No Cache Components: every page is dynamic, and it would force <Suspense>
  // around them, which shows "Loading…" forever if scripts fail. See
  // .claude/rules/app-pages.md.
};

export default nextConfig;
