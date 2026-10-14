import { defineConfig, devices } from "@playwright/test";

// Browsers use PORT (a proxy); the app itself listens on APP_PORT.
const PORT = 3100;
const APP_PORT = 3101;
const ORIGIN = `http://localhost:${PORT}`;

// Runs against a production build (`next build && next start`), not
// `next dev`: some bugs only show up in a built app. The mock TidyHQ keeps
// its state in the server's memory, so tests run one at a time (`workers: 1`)
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
  ],
  webServer: [
    {
      command: `npm run build && npm run start -- --port ${APP_PORT}`,
      url: `http://localhost:${APP_PORT}`,
      // Always a fresh server, so the env below is what the app really runs with.
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        TIDYHQ_MODE: "mock",
        APP_ORIGIN: ORIGIN,
        // Test-only value; never used outside this config.
        SESSION_SECRET: "e2e-only-session-secret-0123456789abcdef",
      },
    },
    {
      // What the browsers talk to; see the file for why it exists.
      command: `node e2e/http-proxy.mjs ${PORT} ${APP_PORT}`,
      url: ORIGIN,
      reuseExistingServer: false,
    },
  ],
});
