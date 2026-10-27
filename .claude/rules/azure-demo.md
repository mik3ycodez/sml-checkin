---
paths:
  - ".github/workflows/**"
  - "scripts/**"
  - "docs/azure-demo.md"
  - "src/app/demo/**"
  - "src/app/DemoBanner.tsx"
  - "src/app/demoBanner.test.ts"
  - "src/lib/demoMode.ts"
  - "src/lib/startupConfig*"
  - "src/app/mock-tidyhq/**"
  - "src/instrumentation.ts"
  - "next.config.ts"
  - "playwright.config.ts"
  - "package.json"
---

# Azure demo rules

- **Host: Azure App Service (Linux, Node 24).** The demo (`TIDYHQ_MODE=mock`,
  `DEMO_MODE=on`) runs the standalone build (`output: "standalone"`, started
  with `node server.js` from the zip root, `HOSTNAME=0.0.0.0`). It is built
  and deployed from GitHub Actions with OIDC (`.github/workflows/deploy.yml`,
  after CI passes on a push to `main`); App Service never builds. Portal
  steps, settings, logs and troubleshooting: `docs/azure-demo.md`.
  - **Exactly one instance**: the mock keeps its state in memory, so no scale
    out and no PM2 cluster mode. Every restart, deploy or sleep resets the
    demo; the portal's Restart is the "reset demo" button.
  - **Never set `E2E` on the demo.** It opens the unauthenticated
    `/mock-tidyhq/reset` route and speeds the admin refresh up to 2 s.
  - A bad config doesn't crash the server (it serves 500s and still prints
    "Ready"), so the deploy ends with `scripts/check-deploy.mjs`: `/` must
    return 200 on this build, and one `/_next/static` CSS file must load.
    `scripts/` is linted with undefined names and unused variables as errors.
  - **`/demo` is the testers' walkthrough** (0.6.1): nine scenarios, each with
    who to sign in as, a Start button, steps and what you should see. Demo
    mode only (404 otherwise); linked from the home page and the banner. Start
    posts to `/auth/signout` with a `returnTo` built by the path helpers, so
    it needs no auth change. `src/app/demo/scenarios.ts` is tested against the
    seed and against the source (every quoted screen text), so changing a
    screen's wording or the seed means updating it. Never mention `E2E` or the
    reset route there; a Restart is how the demo resets.
