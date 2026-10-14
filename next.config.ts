import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No Cache Components: every page is dynamic, and it would force <Suspense>
  // around them, which shows "Loading…" forever if scripts fail. See CLAUDE.md.
};

export default nextConfig;
