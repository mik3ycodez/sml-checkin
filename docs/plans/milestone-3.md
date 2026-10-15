# Milestone 3: Safety net and member status page

**Status:** In progress. PRs 1 to 7 done (#12 to #18); PR 8 (grace period and Partial status) in review (#19).

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
  rebuilds the seed. It returns 404 unless `TIDYHQ_MODE=mock` and `E2E=1`. Mock is the
  default mode, so mock alone would leave it open on a demo site; only
  `playwright.config.ts` sets `E2E=1`. Playwright tests run one at a time
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

### PR 3: Playwright setup and the happy path ✅ Done (#14)

- Add `@playwright/test` and an `npm run test:e2e` script. Specs live in
  `e2e/`, outside Vitest's `src/**/*.test.ts`, so `npm test` stays fast.
  Add `test-results/` and `playwright-report/` to `.gitignore`.
- `playwright.config.ts`: `webServer` runs `next build && next start` on a
  fixed port, with `TIDYHQ_MODE=mock`,
  `APP_ORIGIN=http://localhost:<port>` and a test-only `SESSION_SECRET`.
  Projects: phone-sized WebKit (an iPhone device profile) and Chromium.
  `workers: 1`. _(Built: WebKit won't store `Secure` cookies over
  `http://localhost`, so the cookie `secure` flag now follows APP_ORIGIN's
  scheme, and production startup requires https unless the host is localhost
  or 127.0.0.1.)_
- Mock reset (test-first): add `reset()` to `MockTidyClient` (and
  `MockTidyOAuth`'s pending codes). It isn't on the `TidyClient` interface.
  Add `POST /mock-tidyhq/reset`, which returns 404 unless
  `TIDYHQ_MODE=mock` _(and, added in review, unless `E2E=1`, which only
  `playwright.config.ts` sets, since mock is the default mode)_. Unit tests
  cover the route's 404 in live mode and
  that a reset restores seed totals.
- An `e2e/fixtures.ts` that resets before each test, plus a `signInAs(page,
name)` helper that goes through the fake TidyHQ page.
- First spec: Dante signs in, checks in to `ev_tonight`, and sees +1 with a
  total of 1.
- Commands to learn: `npx playwright install` (one-time browser download),
  `npm run test:e2e`, `npx playwright show-report`.

### PR 4: GitHub Actions CI ✅ Done (#15)

- `.github/workflows/ci.yml`, on pull requests and pushes to `main`, using
  Node 24 from `.nvmrc` and `npm ci`.
  - Job `checks`: `format:check`, `lint`, `typecheck`, `test`, `build`.
  - Job `e2e`: install Playwright browsers (cached), run `test:e2e`, upload
    the HTML report when a test fails.
- No secrets needed, since everything runs against the mock.
- Optional, by hand in GitHub settings afterwards: require both jobs to
  pass before merging.

### PR 5: The rest of the milestone 2 checklist ✅ Done (#16)

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
- _(Built: the no-JavaScript project, `webkit-no-js`, found a real gap. Pages
  behind `<Suspense>` (all the check-in pages and the fake sign-in page) show
  "Loading…" forever with JavaScript off, because Next reveals streamed content
  with a script. The `@nojs` spec is skipped in that project until it's fixed
  in PR 6.)_

### PR 6: Member pages work with JavaScript off ✅ Done (#17)

Why: PR 5's `webkit-no-js` project found that every page behind `<Suspense>`
shows "Loading…" forever with JavaScript off, because Next reveals streamed
content with a script. (A `redirect()` inside streamed content has the same
problem: it can't send a real 307 once streaming has started, so it falls back
to a script.)

Approach to investigate first: turn off `cacheComponents` (and
`partialPrefetching`, which requires it) in `next.config.ts`, then remove the
`<Suspense>` wrappers from the pages. Every page here reads cookies or the
request, so none benefits from prerendering or caching. Without
`cacheComponents`, Next doesn't require Suspense around request-time data,
so a page can render complete HTML, with real redirect and 404 statuses.

Downsides, to confirm before changing anything:

- Leaves Next's direction of travel. The docs say Cache Components and
  Partial Prefetching become the default in the next major version, so a
  later upgrade means re-adopting them (and Suspense) or opting out.
- No `use cache`, `cacheLife`, `cacheTag`, or static app shell. Nothing here
  uses them. If live TidyHQ reads turn out to be slow, caching moves to
  `unstable_cache` or plain in-memory caching in `TidyClient`, not `use cache`.
- Pages wait for all their TidyHQ reads before sending any HTML, where today
  the layout shows first with "Loading…". That's a slower first paint at the
  door, offset by no spinner flash. Measure it with live access (see
  "Deferred").
- Behavior shifts: routes that don't touch request data get prerendered at
  build time. Pages that need mock-mode checks at request time must stay
  dynamic (`connection()`).

Steps (test-first):

- Remove the `knownNoJsGap` skip from `e2e/fixtures.ts` first, confirm
  the `@nojs` spec fails in `webkit-no-js`, then change the config and pages
  until it passes in all three projects.
- Remove `cacheComponents` and `partialPrefetching` from `next.config.ts`.
  Remove `<Suspense>` and the `Loading` fallback from the check-in, result,
  problem, error and mock authorize pages. _(Built: the pages read cookies,
  params or `searchParams`, so they're dynamic without `connection()`, which
  went too. The mock authorize page outside mock mode is now a real 404.)_
- Run every spec in `webkit-no-js`, not just tagged ones, so the `@nojs`
  tag is gone. _(Built that way: simpler, and still about 30 seconds.)_
- `CLAUDE.md`: add a decision (no Cache Components; why; avoid Suspense on
  member pages), so later pages (`/me`) follow it.
- Check: `npm run build` succeeds, all checks pass, and the no-JS skip is
  gone.

### PR 7: Member summary (pure logic, test-first) ✅ Done (#18)

- `src/lib/member/memberSummary.ts`:
  `getMemberSummary(client, { contactId, now })`. It's read-only and
  returns one of:
  - `ok { name, level, membershipEndsOn, membership: "active" |
"renew_soon" | "expired", points: number | null }`
  - `not_member { name, points }` (no counted membership on record; `/me`
    shows a "become a member" message linking to SML's TidyHQ)
  - `unknown_contact` (the session's contact is gone; sign in again, as on
    the check-in page)
- Only memberships that count (not pending or cancelled, already started;
  `countsAsMembership`) are considered. Level: the active one with the
  latest end date, else the most recently ended, then `getMembershipLevel`
  (a deleted level shows "Member"). Expired members still see their last
  level.
- Renewal reminder: `renew_soon` within `RENEWAL_REMINDER_DAYS` (30, a
  constant in `membership.ts`) of the end date. Uses `isActiveMembership`
  and the Seattle date helper.
- Points: `readPoints`. `null` (unreadable) is passed through for the page
  to explain.
- Tests: Dante (active), Sam (ends in two weeks → `renew_soon`), Lee
  (expired), several memberships, no memberships (`not_member`), an
  unreadable points field, and an unknown contact.
- _(Superseded in PR 8: which membership is shown, and what counts as
  `expired`, now come from `membershipStanding`, with a 60-day grace
  period.)_

### PR 8: Membership grace period and Partial status 🔍 In review (#19)

SML policy, for check-in and `/me` alike. Pending and cancelled memberships
never count. Use the counted membership with the **latest end date**, then:

- End date today or later, state `activated` or `partial`: can check in and
  earn points.
- End date passed by 60 days or fewer, any counted state (`activated`,
  `partial`, `expired`): **grace period**, can still check in and earn
  points.
- End date passed by more than 60 days: refused, as expired members are today.

Dates are Seattle calendar days. `GRACE_PERIOD_DAYS = 60` lives in
`membership.ts` next to `RENEWAL_REMINDER_DAYS`. On the day count: exactly 60
days past is allowed, 61 is refused.

Messages (on the check-in confirmation and on `/me`'s summary):

- **Partial with a future end date:** "You have a balance due. Complete
  payment in TidyHQ." Takes priority over the renewal reminder.
- **Grace period:** "Your membership expired on [end date]. Renew by [end date + 60 days] to keep earning points." With the renew link.

Steps (test-first):

- `membership.ts`: `membershipStanding(memberships, now)` returns `none`,
  `current` (with `balanceDue`), `grace` (with `renewBy`) or `lapsed`. It
  replaces `hasActiveMembership`, so check-in and `/me` read one rule. On a
  tie for the latest end date, activated beats partial beats expired. A
  data inconsistency (an `expired` row with a future or missing end date, or
  an unreadable end date) never outranks a sound membership, is logged
  (`logInconsistentMemberships`, contact and membership ids only), and on its
  own is refused. Flagging it for admins goes in milestone 4.
  `membershipNotice(standing)` and `membershipNoticeText(notice)` give the
  two messages.
- `checkIn.ts`: `assessCheckIn` accepts `current` and `grace`.
  `ready` and `checked_in` carry `membershipNotice`.
- The notice reaches the confirmation page through the tap-notice cookie
  (the result page only knows "in the group"). It carries the notice kind and
  the end date; the renew-by date is worked out again on read.
- `getMemberSummary`: `membership` gains `balance_due` and `grace`, plus a
  `notice` field. `/me` (PR 11) renders them.
- Seed: Lee moves to expired 90 days ago, so the "refused" tests keep their
  meaning. New members: Robin Vale (expired about 20 days ago, grace) and
  Avery Quinn (partial, future end date).
- TidyHQ dates are read with `calendarDate` (a timestamp is cut to its date,
  anything unreadable is a data problem), so a format surprise can't throw
  mid-check-in.
- Playwright: grace and balance-due check-ins.

### PR 9: Rewards: club colors (test-first)

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

### PR 10: Recent events

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

### PR 11: `/me` page

- `src/app/me/page.tsx` (Server Component, rendered fully on the server
  like the check-in pages now do: no `<Suspense>` and no `loading.tsx`, per
  CLAUDE.md and `noSuspense.test.ts`). No session redirects to
  `/auth/signin?returnTo=/me`, and `unknown_contact` does the same.
- Shows the name, membership level, and points total (or "Your points
  total needs fixing. Please see a volunteer" when it's unreadable).
- Membership messages:
  - `balance_due`: "You have a balance due. Complete payment in TidyHQ."
    (wins over the renewal reminder).
  - `renew_soon`: "Your membership ends on <date>", plus a renew link from
    `tidyhqSiteUrl()`.
  - `grace`: "Your membership expired on <date>. Renew by <date + 60 days> to
    keep earning points." plus the renew link. (`membershipNoticeText`.)
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
- Playwright spec: Dante after checking in; Sam's renewal message; Robin's
  grace message and Avery's balance due; the
  qualified and issued seed members' colors lines; Lee's expired message.
- Unit tests for the colors and membership message text, like
  `screens.test.ts`.

**Dependencies:** PR 1 goes first, then PR 2. PRs 3→4→5 are one track
(tests and CI). PR 6 (member pages without JavaScript) follows PR 5 and comes before the
`/me` track, so `/me` is built without Suspense. PRs 7→8→9→10→11 are the `/me`
track. PR 11's spec needs PR 3. The suggested order is 1–11, one PR at a time.

## Open questions (verify with real TidyHQ data)

- **How does TidyHQ represent a renewal invoice?** Either an Active
  membership becomes Partial when invoiced, or a renewal creates a new
  unpaid subscription with future dates. We don't know which. The mock
  assumes the first.
- **Known risk: "latest end date wins".** If a renewal invoice creates a new
  unpaid subscription with a future end date, the unpaid renewal would look
  current, and the grace period would never start. If live data shows this,
  measure grace from the end of the last fully paid period instead.
- Verify both during live integration.

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

  `/me`'s recent events (PR 10) belong in that measurement too.

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
- After PR 11, one look by hand on a real phone (`npm run dev`, then open
  `http://<your-laptop-ip>:3000/me` on the same Wi-Fi). Playwright's
  WebKit is close to Safari, but not the same as an old iPhone.
