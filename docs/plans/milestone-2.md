# Milestone 2: Member check-in flow

**Status:** Milestone 2 complete. PRs 1–7 done (merged as #3–#6, #8, #9 and #10).

## Context

The TidyHQ layer is done: `TidyClient`, `MockTidyClient`, seed data, `resolveEventGroup`, and the points field helpers. Nothing lets a member check in yet. This milestone adds the full self check-in path. A member scans a QR code, signs in with (mock) TidyHQ, taps once, and sees a confirmation. We verify their membership, add them to the event's attendance group, and recalculate their points. Each step is built test-first, in small PRs.

Decisions so far:

- Admins set check-in open/close times on each event in TidyHQ. The app looks them up in a single function, `getCheckinWindow`. If an event has no window, it falls back to `start_at`–`end_at`. There's no caching yet.
- Role and method are modeled in code _(Superseded in milestone 3: no check-in roles.)_ but **not saved** for now. No TidyHQ note and no database. This leaves out part of what CLAUDE.md says ("check-ins record who, which event, when, role, method"), and I'll mention it in the PR description.

## Design choices (and why)

- **Check-in is a POST, not a GET.** `/checkin/[eventId]` shows a "Check in" button that submits to a Server Action. If visiting the URL checked you in, link previews in chat apps and browser prefetching could check members in by accident.
- **The session holds only the contact id.** The member's OAuth token is used once, in the callback, to call `getMe` and is then thrown away, as CLAUDE.md requires. The cookie is `{contactId, exp}` signed with HMAC-SHA256 using Node's built-in `crypto`, so no new dependency. Flags: `httpOnly`, `secure` in production, `sameSite=lax`, 90-day life ("remembered").
- **OAuth sits in its own interface, not in `TidyClient`.** Exchanging the sign-in code for a token happens at TidyHQ's accounts server, not its API. `TidyOAuth` has `authorizeUrl({redirectUri, state})` and `exchangeCode(code)`. The mock version points at our fake sign-in page. A live version can come later and is chosen by `TIDYHQ_MODE`, like the client.
- **Points are recalculated from group membership.** _(Superseded in PR 3: the stored TidyHQ points field is the source of truth, and a new check-in adds `POINTS_PER_CHECKIN` to it. See CLAUDE.md, "Key decisions".)_ `listEvents()` → `resolveEventGroup` for each event (unmapped ones skipped) → `listGroupContacts` → count the groups the member is in × points per role _(Superseded in milestone 3: no check-in roles.)_. Retries can't double-count. Point values live in one config.
- **The check-in rules are a single function that returns a result**, not exceptions. The pages only render whatever that result says.
- **Return URLs only allow paths on this site** (they must start with `/` and not `//`), so the sign-in redirect can't send someone to another site.

## Pull requests (in order)

### PR 1: Points and membership rules (pure logic) ✅ Done (#3)

- `src/lib/points.ts`: `POINTS_PER_CHECKIN: Record<CheckInRole, number> = { attendee: 1, volunteer: 1 }`, plus types `CheckInRole = "attendee" | "volunteer"` and `CheckInMethod = "self" | "staff"`. _(Superseded in milestone 3: no check-in roles.)_
- `src/lib/membership.ts`: `hasActiveMembership(memberships, today)` is true if any membership is `activated`/`partial` and its `end_date` hasn't passed.
- Tests first: `points.test.ts`, `membership.test.ts`. Cases: expired, partial, null end date, several memberships.

### PR 2: Event check-in window (one lookup, mock-backed) ✅ Done (#4)

Admins set check-in open/close times when they create the event in TidyHQ. We don't know yet which field holds them.

- `src/lib/tidyhq/checkinWindow.ts`: `getCheckinWindow(client, event): Promise<{ opensAt, closesAt, source: "event" | "fallback" }>`. This is **the only place** that looks up the window, and a cache can go here later (none for now). It's async because the live lookup will probably be an API call.
  - It reads the admin-set window from the raw lookup below. If no window is set, it falls back to `start_at` → `end_at`. If those are missing too, check-in is treated as closed.
- Raw lookup: add `getEventCheckinWindow(eventId): Promise<{opens_at, closes_at} | null>` to `TidyClient`, with a comment that its TidyHQ source is unknown until we have live access. The mock reads it from a new seed map, `checkinWindows`, which has **explicit open/close times for each seed event**. Seed dates are calculated from the seed's `now`, the same way event times already are.
  - At least one seed event has no window, to test the fallback.
- `isCheckinOpen(window, now)` returns `"open" | "not_yet" | "closed"`.
- Seed: switch `dateOnly` to the Seattle calendar date (deferred from PR 3 review), sharing the date helper in `membership.ts`.
- Seed: add `ev_tonight` ("Social Night"), with a window that covers the current time, plus its group in `eventGroups.ts`. That way manual testing works whenever you run it.
- The `mode: "open" | "rsvp_required"` field from CLAUDE.md waits for the RSVP work. It isn't needed in this milestone.
- Tests first: an explicit window is used, the fallback to start/end, missing dates mean closed, the edges (exactly at open, exactly at close), and the mock returning `null` for an event with no window.

### PR 3: Check-in service ✅ Done (#5)

- `src/lib/checkin/checkIn.ts`: `checkIn(client, { eventId, contactId, role = "attendee", method = "self", now })` returns one of: _(Superseded in milestone 3: no check-in roles.)_
  - `checked_in { name, eventName, pointsAwarded, total }`
  - `already_checked_in { name, eventName, total }`
  - `membership_inactive { name }`
  - `not_open { eventName, opensAt } | closed { eventName }`
  - `unknown_event` (the event returns 404, or it has no attendance group)
- Steps: `getEvent` → `getCheckinWindow` + `isCheckinOpen` → `getContact` + `getMemberships` → `listGroupContacts(group)` (if the member is already in the group, skip the add and the point) → `addContactToGroup` → `recalculatePoints` → `updateContact(buildPointsPatch(total))`.
- `src/lib/checkin/recalculatePoints.ts` is its own function, so admin pages can reuse it later.
- _As built:_ no `recalculatePoints`. The service reads the stored total first (an unreadable one returns `points_unreadable` before any write), then adds the member to the group, then writes the stored total plus `POINTS_PER_CHECKIN[role]`. _(Superseded in milestone 3: no check-in roles.)_
- Tests first, run against `MockTidyClient(createSeed(NOW), () => NOW)`, following the existing `MockTidyClient.test.ts` setup. Cases: happy path (Dante gets 0 → 1), already checked in (Marcus at pub night, total unchanged), expired (Lee), unknown event, window not open / closed, retrying gives the same total, and a stale points field gets corrected.

### PR 4: Session cookie ✅ Done (#6)

- `src/lib/auth/session.ts`: `signSession` / `verifySession` (pure, testable), plus `getSession()` / `setSession()` / `clearSession()` wrappers around `cookies()` from `next/headers`.
- `src/lib/auth/returnTo.ts`: `safeReturnTo(value)`.
- Add `SESSION_SECRET` to `.env.example`. It must be set; the app throws a clear error if it's missing.
- Tests first: round trip, tampered signature, expired, wrong secret, bad input. For `returnTo`: `//evil.com`, `https://…`, `/checkin/x` allowed.

### PR 5: Mock "Sign in with TidyHQ" ✅ Done (#8)

- `src/lib/tidyhq/oauth.ts`: the `TidyOAuth` interface and `getTidyOAuth()`. `src/lib/tidyhq/mock/MockTidyOAuth.ts`: its code is `mock-code-<contactId>`, which it exchanges for `issueMockToken(contactId)`.
- Routes (Route Handlers, since they set cookies):
  - `GET /auth/signin?returnTo=…`: makes a random `state`, saves `{state, returnTo}` in a short-lived httpOnly cookie, and redirects to `authorizeUrl`.
  - `GET /auth/callback?code&state`: checks `state`, calls `exchangeCode` → `getMe(token)` → `setSession(contact.id)`, then redirects to `returnTo`. A bad state or code shows a friendly "sign-in failed, try again" page.
  - `POST /auth/signout`: clears the session.
- Fake TidyHQ page: `src/app/mock-tidyhq/oauth/authorize/page.tsx` lists the seed members. Each one is a link back to `redirect_uri?code=…&state=…`. It returns 404 when `TIDYHQ_MODE=live`.
- Tests first for the OAuth logic: the mock's authorize URL has `client_id`, `redirect_uri`, `response_type=code`, `state`; a code exchange followed by `getMe` gives the right contact; a bad code throws a 401 `TidyError`.
- _As built:_ `exchangeCode` takes `{ code, redirectUri }` (real OAuth exchanges must resend the redirect URI). The fake page only redirects to this site's `/auth/callback`. Failed sign-ins go to an `/auth/error` page. After review: mock codes are random, single-use, and tied to their redirect URI; `TIDYHQ_MODE` is required in production (checked at startup in `src/instrumentation.ts`); sign-out refuses cross-site requests. After the second review: `APP_ORIGIN` is required in production and names the site everywhere; each sign-in attempt gets its own state cookie; the fake page posts to `/mock-tidyhq/oauth/approve`, which issues one code per click; `isTidyError()` replaces `instanceof TidyError`.

### PR 6: Check-in page and confirmation ✅ Done (#9)

- `src/app/checkin/[eventId]/page.tsx` (Server Component):
  1. Unknown event → friendly "We couldn't find that event" screen. This shows before sign-in.
  2. No session → `redirect("/auth/signin?returnTo=/checkin/<id>")`.
  3. Shows the event name, "Signed in as X (not you? sign out)", and a large **Check in** button.
- `actions.ts`: a Server Action that calls `checkIn` with the session's contact id and then redirects to `/checkin/[eventId]/result`.
- `result/page.tsx` re-reads the current state from TidyHQ (whether they're in the group, plus the points field). This way a refresh shows the right thing and nothing can be faked through the URL. It shows the confirmation: name, **+1 point**, and the new total.
- The forms are plain HTML `<form action>`, so check-in works even when JavaScript fails on older phones.
- **Sliding session expiry** (deferred from the PR 4 review): after a successful check-in, the Server Action calls `setSession(contactId)` again, which resets the 90-day expiry. Members who keep coming never get signed out. It's done in the action because Server Components can't set cookies. Test first: the action re-issues the cookie on `checked_in` and `already_checked_in`.
- _As built:_ the result page reads state through `getCheckinStatus` (`src/lib/checkin/checkinStatus.ts`), which shares `findEvent` with `checkIn` and changes nothing. "+N points" shows only when this tap awarded them: group membership can't tell (the points write may have failed, or staff added the member), so the action leaves a 60-second httpOnly note for the result page (`src/lib/checkin/awardNotice.ts`), tied to the member and event so a shared phone never shows someone else's point. The total is always re-read. A session whose contact TidyHQ no longer has (`checkIn` and `getCheckinStatus` now return `unknown_contact`) sends the member to sign in again. `readAttendance` is the one place that decides "already checked in", for both. Both pages show "Signed in as X. Not you? Sign out" (`SignedInAs`), so a shared phone can switch members from the result page too. Every action outcome except `unknown_event` redirects to the result page; members who weren't checked in (expired, not open, unreadable total) see a plain "You're not checked in" until PR 7 explains why. "Not you? sign out" posts `returnTo` to `/auth/signout` (checked with `safeReturnTo`), so it leads straight back to sign-in. The pages sit behind `<Suspense>` because `cacheComponents` is on; a redirect from there is sent as a meta refresh, which works without JavaScript.

### PR 7: Friendly outcome screens ✅ Done (#10)

- One small component per non-happy outcome, shown from the page or the action result:
  - **Membership expired**: renew link to `https://${TIDYHQ_DOMAIN_PREFIX}.tidyhq.com` (in config).
  - **Already checked in**: "You're already checked in, no extra point", plus the current total.
  - **Unknown event**: replaces the plain text from PR 6.
  - **Check-in not open yet / closed**: shows the open time in Seattle time.
- Expired and already-checked-in are also caught on page load, so the member sees them without tapping the button. A member who's already checked in sees the "already checked in" screen (with their total) **instead of** the Check in button, not alongside it. Found in PR 6 manual testing.
- **Points total unreadable** (`points_unreadable`, added in PR 3): "Please see a volunteer" message. The stored total isn't a plain whole number, so the member isn't checked in until someone fixes it in TidyHQ. `already_checked_in` can also carry `total: null` for the same reason; show the check-in without a total.
- **Server-side error logging** (deferred from the PR 3 review, comment #5): log check-in failures on the server (event id, contact id, step, TidyHQ status; never tokens), especially a points write that fails after the group add, since that point is otherwise lost without a trace. Show the member a friendly error rather than a crash.
- _As built:_ the rules live in one read-only function, `assessCheckIn` (in `checkIn.ts`). `checkIn` acts on it, and the pages show it directly before the tap, so the page and the tap can't disagree. `already_checked_in` means "in the event's group" everywhere. Refusals all carry `name` and `eventName`, so every screen shows "Signed in as X". Both pages load through `memberStatus` and render `StatusScreen` (`screens.tsx`); the check-in page shows the button only when `ready`, and the result page sends `ready` back to it. The action leaves a 60-second tap notice (`src/lib/checkin/tapNotice.ts`, replacing `awardNotice.ts`) saying what the tap did: `awarded` (+N), `repeat` ("no extra point this time"), or `point_not_saved`. A plain page load just says "You're already checked in" with the total. The renew link comes from `tidyhqSiteUrl()` (`src/lib/tidyhq/site.ts`, `TIDYHQ_DOMAIN_PREFIX`, default `sml`, refusing anything that isn't a plain subdomain; checked at startup). Open times use `seattleTimeLabel` in `dates.ts`. TidyHQ failures in `checkIn` throw `CheckInFailure { step: "lookup" | "group_add" | "points_write", cause: TidyError }`; other errors are bugs and pass through to `error.tsx` and Next.js's logging. The action logs `{eventId, contactId, step, tidyStatus, message}` (`logCheckinFailure`, never tokens or the session). A failed lookup or group add goes to `/checkin/[eventId]/problem` ("Try again", no TidyHQ calls); a failed points write goes to the result page, which says "You're checked in, but your point didn't save. Please let a volunteer know." A page that fails to load shows `error.tsx`, whose "Try again" is a plain reload link.

**Dependencies:** PRs 1→2→3 and PRs 4→5 are two separate tracks. PR 6 needs all of them, and PR 7 comes after PR 6. The suggested order is 1, 2, 3, 4, 5, 6, 7.

## Files reused

- `getTidyClient`, `TidyError`: `src/lib/tidyhq/index.ts`, `errors.ts`
- `resolveEventGroup`: `src/lib/tidyhq/eventGroups.ts`
- `buildPointsPatch`, `readPoints`: `src/lib/tidyhq/customFields.ts`
- `issueMockToken`, `MockTidyClient`, `createSeed`: `src/lib/tidyhq/mock/`
- Layout container: `src/app/layout.tsx`. Colors: `bg-background` / `text-foreground`.

## Verification

- Each PR: `npm test`, `npm run typecheck`, `npm run lint`. For TDD, run the new tests first and confirm they fail, then implement.
- End-to-end after PR 7, by hand (`npm run dev`, phone-sized window). Check that:
  - `/checkin/ev_tonight` → fake sign-in → pick Dante → back on the check-in page → tap → confirmation shows +1, total 1.
  - Reloading `/checkin/ev_tonight` shows "already checked in" and the total stays 1.
  - Signing out and back in as Lee shows the expired screen with a renew link.
  - `/checkin/nope` shows the unknown-event screen. `/checkin/ev_leather_brunch` shows the not-open-yet screen.
  - In devtools, the session cookie is `HttpOnly` and holds no token.
