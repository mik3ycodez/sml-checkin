# SML Check-in

Event check-in and points tool for Seattle Men in Leather (SML). TidyHQ is the
system of record; this app is a thin layer on top of it.

- Members scan an event QR code, sign in with TidyHQ, and check in with one tap.
- Check-in verifies active membership, records attendance in the event's TidyHQ
  contact group, and updates the member's points total.
- Members get a status page; the SML Board gets event QR codes, live attendee
  lists, manual check-in, and points adjustments.

See [CLAUDE.md](CLAUDE.md) for the full scope and design decisions.

## Mock TidyHQ

The app currently runs against an in-memory **mock TidyHQ** with seed members
and events (`src/lib/tidyhq/mock/seed.ts`), until SML's TidyHQ plan allows
another app integration. Data resets whenever the server restarts. The client is
chosen by `TIDYHQ_MODE` (`mock`, the default, or `live`, not yet implemented).

## Getting started

Requires Node 24 or newer (see `.nvmrc`).

```bash
npm install                  # install dependencies
cp .env.example .env.local   # optional: local settings (defaults to mock mode)
npm run dev                  # dev server at http://localhost:3000
```

## Tests and checks

```bash
npm test             # run the test suite once
npm run test:watch   # re-run tests on file changes
npm run typecheck    # TypeScript type check
npm run lint         # ESLint
```

### End-to-end tests

```bash
npx playwright install   # one-time: downloads the WebKit and Chromium browsers
npm run test:e2e         # builds the app and runs the specs in e2e/
npx playwright show-report   # open the HTML report (after a CI-mode run)
```

`playwright.config.ts` sets `E2E=1`, which turns on `POST /mock-tidyhq/reset`
(mock mode only). Don't set it anywhere else.
