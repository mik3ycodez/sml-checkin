# Milestone 3: Safety net and member status page

**Status:** In progress. PRs 1 and 2 done (#12, #13); PR 3 in review (#14).

## Context

Milestone 2 finished self check-in. Two problems remain:

- Every PR is still checked by hand in a browser.
- Members can't see their points or membership outside a check-in.

This milestone adds formatting, removes a concept we no longer need, sets up
end-to-end tests and CI, and builds the `/me` member status page.

The admin pages (event list, QR codes, live attendees, staff check-in,
invalid-window warnings) move to [milestone 4](milestone-4.md). They need
an admin sign-in design first, and staff check-in comes with recording
method and time.

**Until the admin pages exist:** make an event's QR code with any QR
generator, pointing to `APP_ORIGIN/checkin/<eventId>` (for example
`https://checkin.example.org/checkin/ev_tonight`). The event id is the
TidyHQ event id.

Decisions so far:

- **There are no check-in roles.** Volunteers are members flagged in TidyHQ,
  not a kind of check-in. Every check-in is a normal member check-in and
  earns the same points. PR 2 removes `attendee` / `volunteer` from the
  code and docs. Words like "see a volunteer at the door" in the UI stay:
  they refer to people, not a role.
- **Mock state resets through a mock-only route.** `POST /mock-tidyhq/reset`
  rebuilds the seed. It returns 404 unless `TIDYHQ_MODE=mock`, the same
  guard as the fake sign-in page. Playwright tests run one at a time
  (`workers: 1`) so a reset never interrupts another test.
- **CI runs in this milestone.** GitHub Actions runs lint, the format check,
  typecheck, Vitest, and Playwright on every PR.
- **Rewards are a small list in config.** Today there's one reward: club
  colors at 18 points. The list lives next to `POINTS_PER_CHECKIN`, so
  merchandise or vendor discounts can be added later without a redesign.
  Only the club colors rule gets built now.
- **The app only displays reward status.** Issuing club colors happens in
  TidyHQ. Its "colors issued" field is read, never written.

## Design choices (and why)

- **Prettier goes first, and the reformat is one commit.** Later PRs then
  contain only real changes. That commit's hash goes in
  `.git-blame-ignore-revs`, so `git blame` (and GitHub's blame view) skips
  over it.
- **Playwright runs against `next build && next start`, not `next dev`.**
  The bugs milestone 2's manual runs caught (`instanceof` across bundles,
  prerender errors, Edge-runtime build failures) only show up in a
  production build.
- **CI comes right after the first Playwright spec.** The rest of the
  checklist specs then run in CI as they land, not just on my laptop.
- **`/me` logic is one read-only function that returns a result**, like
  `assessCheckIn`. The page only renders it, and the logic is unit-tested
  without a browser.
- **Recent events are a bounded query in their own PR.** TidyHQ has no "events
  this contact attended" endpoint we know of, so we list recent events and
  read each one's attendance group. That costs one round trip per event, so
  it's capped and kept separate where we can measure it later.

## Pull requests (in order)

### PR 1: Prettier ✅ Done (#12)

- Add `prettier` and `prettier-plugin-tailwindcss` (sorts Tailwind classes
  in a fixed order, so class lists don't churn in diffs) as dev dependencies.
  Add `.prettierrc.json` (defaults plus the plugin) and `.prettierignore`
  (`.next`, `node_modules`, `package-lock.json`, `next-env.d.ts`, and the
  `next dev`-managed block in `AGENTS.md`).
- Add `eslint-config-prettier`, so ESLint never flags something Prettier
  formats.
- Scripts: `npm run format` (writes) and `npm run format:check` (CI).
- Two commits: the config, then a separate repo-wide `npm run format`.
  Add that second commit's hash to `.git-blame-ignore-revs` in a follow-up
  commit on the same PR.
- Check: `npm test`, `npm run typecheck` and `npm run lint` all pass with no
  logic changes.

### PR 2: Remove check-in roles ✅ Done (#13)

- `src/lib/points.ts`: drop `CheckInRole` and the per-role record.
  `POINTS_PER_CHECKIN` becomes a single number (`1`), still the one place
  point values live. Keep `CheckInMethod` (milestone 4 records it).
- `src/lib/checkin/checkIn.ts`: drop the `role` input. Points awarded is
  `POINTS_PER_CHECKIN`.
- Tests: `points.test.ts` checks the single value. Delete the "awards
  volunteer points for a volunteer check-in" test in `checkIn.test.ts`.
  The requirement it tested no longer exists, so deleting it is correct
  (the PR description will say so).
- `CLAUDE.md`: remove the role bullet, and remove role from the "new
  check-in" and "check-ins record" bullets. A check-in records who, which
  event, when, and method.
- `milestone-2.md`: add _(Superseded in milestone 3: no check-in roles.)_
  notes where it mentions roles, following the existing PR 3 note. Leave
  the history in place.

### PR 3: Playwright setup and the happy path 🔍 In review (#14)

- Add `@playwright/test` and an `npm run test:e2e` script. Specs live in
  `e2e/`, outside Vitest's `src/**/*.test.ts`, so `npm test` stays fast.
  Add `test-results/` and `playwright-report/` to `.gitignore`.
- `playwright.config.ts`: `webServer` runs `next build && next start` on a
  fixed port, with `TIDYHQ_MODE=mock`,
  `APP_ORIGIN=http://localhost:<port>` and a test-only `SESSION_SECRET`.
  Projects: phone-sized WebKit (an iPhone device profile) and Chromium.
  `workers: 1`. _(Built: WebKit won't store `Secure` cookies over
  `http://localhost`, so a test-only proxy, `e2e/http-proxy.mjs`, sits in front
  of `next start` and strips the flag. App cookie settings are unchanged.)_
- Mock reset (test-first): add `reset()` to `MockTidyClient` (and
  `MockTidyOAuth`'s pending codes). It isn't on the `TidyClient` interface.
  Add `POST /mock-tidyhq/reset`, which returns 404 unless
  `TIDYHQ_MODE=mock`. Unit tests cover the route's 404 in live mode and
  that a reset restores seed totals.
- An `e2e/fixtures.ts` that resets before each test, plus a `signInAs(page,
name)` helper that goes through the fake TidyHQ page.
- First spec: Dante signs in, checks in to `ev_tonight`, and sees +1 with a
  total of 1.
- Commands to learn: `npx playwright install` (one-time browser download),
  `npm run test:e2e`, `npx playwright show-report`.

### PR 4: GitHub Actions CI

- `.github/workflows/ci.yml`, on pull requests and pushes to `main`, using
  Node 24 from `.nvmrc` and `npm ci`.
  - Job `checks`: `format:check`, `lint`, `typecheck`, `test`.
  - Job `e2e`: install Playwright browsers (cached), run `test:e2e`, upload
    the HTML report when a test fails.
- No secrets needed, since everything runs against the mock.
- Optional, by hand in GitHub settings afterwards: require both jobs to
  pass before merging.

### PR 5: The rest of the milestone 2 checklist

- Reloading shows "already checked in", and the total is unchanged.
- Lee sees the expired screen with a renew link to the TidyHQ site.
- Unknown event (`/checkin/nope`) and not-open-yet (`ev_leather_brunch`)
  screens.
- The session cookie is HttpOnly and holds no token.
- Sign-in edge cases now checked by hand with curl: two tabs signing in at
  once, a bad or reused code landing on the error page, and sign-out from
  another site being refused.
- A project with `javaScriptEnabled: false` runs the sign-in and check-in
  specs, per the older-phones rule.
- Once this lands, milestone 2's "Verification" list is automated. The
  "Verification" section below drops the manual browser steps.

### PR 6: Member summary (pure logic, test-first)

- `src/lib/member/memberSummary.ts`:
  `getMemberSummary(client, { contactId, now })`. It's read-only and
  returns one of:
  - `ok { name, level, membershipEndsOn, membership: "active" |
"renew_soon" | "expired", points: number | null }`
  - `unknown_contact` (the session's contact is gone; sign in again, as on
    the check-in page)
- Level: the active membership with the latest end date, then
  `getMembershipLevel`. Expired members still see their last level.
- Renewal reminder: `renew_soon` within `RENEWAL_REMINDER_DAYS` (30, a
  constant in `membership.ts`) of the end date. Reuse
  `hasActiveMembership` and the Seattle date helper.
- Points: `readPoints`. `null` (unreadable) is passed through for the page
  to explain.
- Tests: Dante (active), Sam (ends in two weeks → `renew_soon`), Lee
  (expired), several memberships, an unreadable points field, and an
  unknown contact.

### PR 7: Rewards: club colors (test-first)

- `src/lib/points.ts`, next to `POINTS_PER_CHECKIN`: `REWARDS`, a list of
  `{ id: "club_colors", name: "club colors", pointsRequired: 18 }`. Only
  this reward for now.
- `src/lib/rewards.ts`: `rewardStatus(reward, points, issued)` returns
  `{ kind: "progress", remaining } | { kind: "qualified" } | { kind:
"issued" }`. Issued wins even under 18 points (the Board may issue
  early, or points may later be adjusted).
- `customFields.ts`: `COLORS_ISSUED_FIELD_ID` and `readRewardIssued(contact,
rewardId): boolean | null`. It's the only place that knows the field's
  format, which is unknown until live access. For the mock, the field is a
  string where `"yes"` means issued and blank or missing means not issued.
  Anything else is `null` (unreadable).
- Unreadable issued field or unreadable points: show nothing for that
  reward rather than guess. Telling someone colors are coming when they
  already have them, or the reverse, is worse than saying nothing.
- Seed: add the issued field to contacts, plus two new members: one with
  18 points and colors not issued (qualified), and one with 25 points and
  colors issued.
- `getMemberSummary` gains `rewards: { reward, status }[]`.
- `CLAUDE.md`: add a "Rewards" key decision covering club colors at 18
  points, display-only, and the issued field read from TidyHQ.
- Tests: 0, 17, 18 and 30 points not issued; issued at 25 and at 10; an
  unreadable issued field; unreadable points.

### PR 8: Recent events

- `src/lib/member/recentEvents.ts`: `getRecentEvents(client, { contactId,
now })` lists events from the last `RECENT_EVENTS_DAYS` (90) with
  `listEvents({ after, before: now })`. For each one it calls
  `resolveEventGroup` and reads the group in parallel, keeps the events the
  member is in, newest first, and returns at most 5 (`{ id, name, startAt
}`).
- Shares `readAttendance`'s "is this contact in the group" check, so
  check-in and `/me` agree.
- Unmapped events are skipped. A failed group read fails the whole
  section, not the page: the page shows "Couldn't load recent events".
- Tests: attended / not attended, outside the window, more than 5, an
  unmapped event, and a group read failing.

### PR 9: `/me` page

- `src/app/me/page.tsx` (Server Component, behind `<Suspense>` like the
  check-in pages). No session redirects to
  `/auth/signin?returnTo=/me`, and `unknown_contact` does the same.
- Shows the name, membership level, and points total (or "Your points
  total needs fixing. Please see a volunteer" when it's unreadable).
- Membership messages:
  - `renew_soon`: "Your membership ends on <date>", plus a renew link from
    `tidyhqSiteUrl()`.
  - `expired`: an expired message plus the renew link.
- Club colors, one of:
  - "X more points until you qualify for club colors"
  - "You qualify for club colors! A Board member will connect with you to
    distribute your club colors."
  - "Club colors issued"
- Recent events list, or "No events in the last 90 days".
- View only: no forms except "Not you? Sign out" (`SignedInAs`).
- Link to `/me` ("See your points") from the check-in result screens.
- Plain HTML with no client JavaScript, readable on older phones.
- Playwright spec: Dante after checking in; Sam's renewal message; the
  qualified and issued seed members' colors lines; Lee's expired message.
- Unit tests for the colors and membership message text, like
  `screens.test.ts`.

**Dependencies:** PR 1 goes first, then PR 2. PRs 3→4→5 are one track
(tests and CI). PRs 6→7→8→9 are the `/me` track. PR 9's spec needs PR 3.
The suggested order is 1–9, one PR at a time.

## Deferred

- **To [milestone 4](milestone-4.md): admin pages.** Admin sign-in, the
  event list with QR codes, live attendee list, staff check-in by name
  search, recording method (`self` / `staff`) and time, and
  invalid-window warnings.
- **Until live TidyHQ access: fewer round trips at the door.** Kept from the
  earlier draft of this plan: the check-in page runs the full
  `assessCheckIn` on load (about four TidyHQ reads), and the tap repeats
  them before its two writes. Ideas to measure with live access:
  - Start `findContact` alongside `findEvent`, keeping the contact read
    before the group read (that order prevents double awards).
  - Fetch memberships alongside the group read.
  - A short cache in `getCheckinWindow` and one membership helper.
  - A "this contact's groups" endpoint in place of downloading the whole
    group.

  `/me`'s recent events (PR 8) belong in that measurement too.

- **Later: more rewards** (merchandise, vendor discounts). Add them to
  `REWARDS`, each with its own issued field.

## Files reused

- `assessCheckIn`, `readAttendance`, `findEvent`: `src/lib/checkin/checkIn.ts`
- `hasActiveMembership`, Seattle date helpers: `src/lib/membership.ts`,
  `src/lib/dates.ts`
- `readPoints`, `POINTS_FIELD_ID`: `src/lib/tidyhq/customFields.ts`
- `resolveEventGroup`: `src/lib/tidyhq/eventGroups.ts`
- `getSession`, `safeReturnTo`: `src/lib/auth/`
- `tidyhqSiteUrl`: `src/lib/tidyhq/site.ts`
- `SignedInAs` and the screen layout: `src/app/checkin/[eventId]/screens.tsx`
- `MockTidyClient`, `createSeed`: `src/lib/tidyhq/mock/`

## Verification

- Each PR: `npm test`, `npm run typecheck`, `npm run lint`,
  `npm run format:check` (from PR 1), and `npm run test:e2e` (from PR 3).
  For TDD, run the new tests first and confirm they fail.
- From PR 4, CI runs all of these on every PR.
- After PR 9, one look by hand on a real phone (`npm run dev`, then open
  `http://<your-laptop-ip>:3000/me` on the same Wi-Fi). Playwright's
  WebKit is close to Safari, but not the same as an old iPhone.
