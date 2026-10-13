# Milestone 3

**Status:** Not started. This plan collects items as they come up; it gets a
full PR breakdown when milestone 2 is done.

## Items

### Automated end-to-end tests with Playwright

**Why:** Unit tests can't see how Next.js builds and serves the app. The
manual curl runs in milestone 2 caught several bugs the unit tests missed:
`instanceof` failing across route and page bundles, a `new Date()` prerender
error, and an Edge-runtime build failure from the startup check. Automating
those runs keeps catching that kind of bug.

**Scope (to confirm when planned):**
- Add `@playwright/test` as a dev dependency and an `npm run test:e2e`
  script. Specs live in `e2e/`, outside Vitest's `src/**/*.test.ts`, so
  `npm test` stays fast.
- Run against a production build (`next build && next start`), not
  `next dev`, since that's where bundling and prerendering bugs show. Set
  `TIDYHQ_MODE=mock`, `APP_ORIGIN=http://localhost:<port>` and a test
  `SESSION_SECRET` through Playwright's `webServer` config.
- Run on a phone-sized WebKit (Safari) profile, as members use the app at
  event doors, plus Chromium.
- Cover the milestone 2 verification list, which is manual for now:
  - Sign in through the fake TidyHQ page, check in to `ev_tonight`, see +1
    and the new total.
  - Reload: "already checked in", total unchanged.
  - Lee sees the expired screen with a renew link.
  - Unknown event and not-open-yet screens.
  - The session cookie is HttpOnly and holds no token.
- Sign-in edge cases now checked by hand with curl: two tabs signing in at
  once, a bad or reused code lands on the error page, sign-out from another
  site is refused.
- Check that the core flows work with JavaScript disabled (plain forms), per
  the older-phones rule in CLAUDE.md.

**Open questions:**
- Mock state lives in the server process and isn't reset between tests. Do
  we use a different seed member per test, restart the server per spec file,
  or add a mock-only reset route?
- Run in CI (GitHub Actions) as part of this item, or later?
