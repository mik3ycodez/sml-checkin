import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const ORIGIN = `http://127.0.0.1:${PORT}`;

// Runs the standalone server (`npm run build:standalone`, then
// `node .next/standalone/server.js`), the same thing that ships, not
// `next dev` or `next start`: some bugs only show up in a built app. `server.js`
// loads `.env` and `.env.production` from `.next/standalone` if they exist
// (Next copies them there), and `next build` reads `.env.local`. Those files
// are gitignored, so CI has none; locally they could add to the env below.
// The mock TidyHQ keeps its state in the server's memory, so tests run one at a time (`workers: 1`)
// and each starts with a reset (see e2e/fixtures.ts).
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html"]] : "list",
  use: { baseURL: ORIGIN, trace: "retain-on-failure" },
  projects: [
    { name: "webkit-phone", use: { ...devices["iPhone 15"] } },
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // Scripts failing to load on event Wi-Fi: every spec must still pass.
    {
      name: "webkit-no-js",
      use: { ...devices["iPhone 15"], javaScriptEnabled: false },
    },
  ],
  webServer: {
    command: "npm run build:standalone && node .next/standalone/server.js",
    url: ORIGIN,
    // Always a fresh server, so the env below is what the app really runs with.
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      // server.js reads these two. HOSTNAME is set because some hosts (CI
      // runners, App Service) set it to the machine's name.
      PORT: String(PORT),
      HOSTNAME: "127.0.0.1",
      TIDYHQ_MODE: "mock",
      // A production server, which refuses mock data unless
      // it is a demo. So the suite runs as one, and shows the banner.
      DEMO_MODE: "on",
      // Turns on POST /mock-tidyhq/reset. Set nowhere else.
      E2E: "1",
      // http, so cookies aren't Secure: WebKit won't store those over http.
      APP_ORIGIN: ORIGIN,
      // Test-only value; never used outside this config.
      SESSION_SECRET: "e2e-only-session-secret-0123456789abcdef",
    },
  },
});
