# SML Check-in

Event check-in and points tool for Seattle Men in Leather (SML). TidyHQ is the
system of record; this app is a thin layer on top of it.

## What it does (MVP)

- **Self check-in, no tickets.** Member scans an event QR code with their phone,
  signs in with TidyHQ (first time only; the session is remembered), and is
  checked in with one tap.
- **Verifies active membership** against TidyHQ at check-in.
- **Records attendance** by adding the member to the event's TidyHQ contact group.
- **Awards points** and writes the member's total to a TidyHQ custom contact field
  (read-only to members).
- **Member status page:** name, membership level, points total, recent events,
  benefit progress, and helpful messages (e.g. renewal reminder linking to TidyHQ).
  View only; all changes and renewals happen in TidyHQ.
- **Admin side (SML Board / social coordinator):** event list pulled from TidyHQ,
  check-in QR per event, live attendee list, manual check-in by name search
  (logged as a staff check-in), simple reports.

## Out of scope for MVP

- RSVP, headcount, and capacity limits (later enhancement; events should carry a
  check-in mode field, `open` now and `rsvp_required` later)
- Payments, renewals, profile editing (TidyHQ handles these)
- Anti-gaming measures (audits instead)
- Its own database (add later only if reporting needs it)

## Key decisions

- Events are created and advertised in TidyHQ, never in this app.
- Member sign-in uses TidyHQ OAuth (authorization code flow, `domain_prefix=sml`).
  The member's token is used only to identify them (`GET /v2/contacts/me`).
- All other TidyHQ calls (membership checks, group writes, points updates) happen
  server-side with an admin-level token, never from the browser.
- Points: **1 point per event attended.** Keep point values in one config spot,
  since rules may expand later.
- The stored TidyHQ points field is the source of truth. It includes
  balances migrated from WildApricot and any corrections made in TidyHQ, so
  attendance is never used to recalculate or verify points.
- **The app edits nothing in TidyHQ beyond a check-in.** It writes exactly
  four things, all during a new check-in, in this order: the member's place
  in the event's group, `POINTS_PER_CHECKIN` added to the stored total, the
  member's place in the "App Color Eligible" group (`COLORS_GROUP_ID`,
  only when they reach 18+ points; milestone 5, PR 7), and the staff note (staff
  check-ins only, always last). Points corrections and every other change to member
  data happen in TidyHQ, by people SML appoints. Admin points adjustments are
  dropped, not deferred: TidyHQ already has the permissions, history and audit
  a correction needs.
- On a new check-in (member not already in the event's group), add the
  member to the group first, then add `POINTS_PER_CHECKIN` to
  the stored total. If they're already in the group, award nothing and change
  nothing. One check-in per member per event.
- A failure between the group add and the points write may miss a point, but
  must never double-award.
- Points never reset: the stored total is never cleared, for example at the
  end of a membership year.
- SML policy: points, including balances migrated from WildApricot, are
  entered as plain whole numbers. The app tolerates surrounding spaces and
  commas (`1,234`), but treats decimals, negatives, or other text as an
  unreadable total: check-in is refused (`points_unreadable`) and the field is
  never overwritten. A blank field counts as 0. **In live mode, a points field
  missing from the response (as opposed to blank) is also unreadable**
  (`points_unreadable`) until the go-live checklist confirms how TidyHQ sends
  unanswered fields; mock mode treats missing as blank.
- **Rewards (display-only).** Club colors at 18 points (`REWARDS` in
  `points.ts`). The Board hands them out and marks them issued in a TidyHQ
  custom field (`readRewardIssued`); this app only reads it. Issued wins over
  everything, even under 18 points. Unreadable points or issued field: say
  nothing about the reward rather than guess.
- **Colors need a current, fully paid membership.** A member at 18+ points
  who isn't issued still sees "You qualify", but the message depends on
  `membershipStanding`: current says a Board member will connect with them;
  grace, lapsed, or no counted membership at all says renew first; balance
  due says complete payment first. Under 18 points, only members who can
  still earn points (current, grace, balance due) see a plain countdown;
  lapsed members are told to renew to keep earning, with the points still
  needed, and non-members are told members earn colors at 18 points.
  The check-in confirmation shows it only when that check-in's point brought
  them to 18 (decided in `checkIn`, from the read before the write); `/me`
  shows it whenever it applies.
- **An invalid check-in window is ignored, and the admin event page says so.**
  A window that's half-filled, unparseable, or closes before it opens is
  dropped, and check-in falls back to the event's start and end, so a typo in
  TidyHQ never locks members out. Spaces around a time are ignored, and a
  field holding only spaces is blank. Times must be ISO 8601 with an explicit
  offset or `Z` (`parseTime` in `timeRange.ts`); anything else, such as
  "Oct 17 18:30" (which JavaScript reads as the year 2001), is unparseable
  and shows the warning. The rule is `rangeProblem` there, used by check-in
  (via `resolveCheckinWindow`) and the warning. **The admin event page is the
  authority on check-in problems.** The event list's flag ("end isn't after
  start") is a cheap hint from the event's own times; it never reads the admin
  window, so a bad window shows only on the event page.
- **Archived events refuse check-in.** `assessCheckIn` returns
  `event_unavailable` ("This event isn't open for check-in") for an archived
  event even if its window is open, so a QR code printed earlier stops working.
  A member already in its group still sees their check-in.
- **Event QR codes** point to `APP_ORIGIN/checkin/<eventId>`, drawn as SVG on
  the server. An archived event, one with no attendance group, or one whose
  check-in can never open (no usable window or event times) gets the reason
  shown instead of a code, and the page never says check-in is open or using
  the event's times when members can't check in. These are the same cases
  check-in refuses, and a test checks that they agree.
- What a check-in records: for every check-in, who and which event (the
  member's place in the event's TidyHQ group). A **staff** check-in also
  writes a TidyHQ contact note with the event, which staff member did it (their
  role, name and contact id), and when;
  a self check-in writes no note, so a check-in with no note was a self
  check-in. A self check-in's time isn't recorded (TidyHQ's API documents no
  timestamp for group membership); that gap is accepted. A failed note is
  logged and never fails the check-in or touches points.
- **The admin event page's attendee list** is the event group's members
  (`listGroupContacts`, every page, once each), sorted by name, with a count.
  It reloads itself every 30 seconds with a meta refresh (works with JavaScript
  off), only while check-in is open or within 30 minutes of opening
  (`attendeeRefreshSeconds`). A TidyHQ failure never ends the refresh: an
  unreadable event shows "temporarily unavailable" and retries, "couldn't check
  access" retries the event page, and an unreadable list says so while the QR
  code still shows. Method and time aren't shown.
- **Check-in volunteers.** Contacts in SML's "App Check-In Volunteers" group
  (id in `HELPER_GROUP_ID`; managed in TidyHQ, never written by the app) can
  run **staff check-in only** (`/admin/events/<id>/checkin`). Admins can too.
  `requireVolunteer` guards the page and its action, returns the role, and
  re-reads both groups on every request, failing closed like `requireAdmin`.
  The URL is the mode: no cookie, nothing stored. A volunteer loses the page
  once check-in has closed, the event is archived, or it can never open (never
  just because it hasn't opened yet); admins aren't limited. **A volunteer
  sees search by name, and a member's name, points total and a verdict.**
  The verdict gives a specific reason only for event outcomes (already checked
  in, not open yet, closed, unavailable); every membership or points refusal
  is one generic line ("Can't check in here. Please see a Board member.").
  Admins see the specific reasons and inconsistent-membership warnings
  (`staffVerdict`).
- **Club colors owed report** (`/admin/reports/colors`, admins only, not
  volunteers; linked from the admin home). Lists members at 18+ points not
  marked issued, using `rewardStatus`, `readRewardIssued` and
  `membershipStanding` as `/me` does (`getColorsOwed`): "Ready to receive
  colors" (current) first, then "Needs to renew or pay first" (balance due,
  grace, lapsed, no counted membership). Unreadable points or issued field go
  in a separate "Needs checking" list, never guessed. Read-only: TidyHQ is the
  official record and the app never marks colors issued. A TidyHQ failure
  shows "temporarily unavailable" with a retry link, never a partial list.
- **`/me` is reachable from the home page and the member check-in screens via
  "My points and status".** Don't remove those links (`MyPointsLink`,
  `MemberFooter`, the home page); tests check them.
- **A member's name is always `contactName(contact)`** (`src/lib/tidyhq`):
  display name, else first and last name, else "Unnamed member". Never read
  `display_name` directly: live data may have nulls.
- **Admins are the contacts in SML's "App Admin" group in TidyHQ** (id in
  `ADMIN_GROUP_ID`; the Board manages the group in TidyHQ, the app never
  writes it). Admins sign in the same way as members. The group is read on
  every admin request, so a removal takes effect on the person's next page
  load. It fails closed: if the group can't be read (TidyHQ error, unknown
  group, unset or invalid id), nobody is let in and it's logged. A missing
  `ADMIN_GROUP_ID` doesn't stop member check-in or the server starting. Every
  admin page and server action calls `requireAdmin`, except the staff
  check-in page and its action (added in milestone 4, PR 6b), which call
  `requireVolunteer` (a volunteer or an admin); a page check alone doesn't
  protect an action.
- **Contact status is not a check-in gate.** Membership standing is the only
  one: an inactive (archived) contact with a counted membership can sign in,
  check in and earn points. That is a data issue for the Board to fix in
  TidyHQ, not something the app decides. (Admin and volunteer access are
  different: they require an active contact, so a deactivated Board member or
  volunteer is out.) Group lists include inactive contacts (`show_all=true`)
  so such a member shows as already checked in rather than earning a point on
  every tap.
- Membership standing (check-in and `/me` use one rule, `membershipStanding`).
  Pending and cancelled memberships never count. Use the counted membership
  with the latest end date. End date today or later with status activated or
  partial: can check in and earn points. End date passed by up to
  `GRACE_PERIOD_DAYS` (60, next to `RENEWAL_REMINDER_DAYS`) in any counted
  status, including expired: grace period, can still check in and earn
  points. An `expired` membership ending today counts as grace too (TidyHQ
  may flip the state before Seattle's end of day). Passed by more: refused. All dates are Seattle time. Messages: a
  partial membership with a future end date says "You have a balance due.
  Complete payment in TidyHQ." (it beats the renewal reminder); the grace
  period says when it expired and the date to renew by.
- An `expired` membership with a future or missing end date shouldn't occur
  (ending early in TidyHQ is "cancelled"), so it's a data inconsistency: it
  never outranks a sound membership, is refused if it's all they have, and is
  logged as a warning (contact and membership ids only). Admin pages will
  flag these (milestone 4).
- **Unverified assumptions (check against live TidyHQ data).** We don't know
  how TidyHQ represents renewal invoices: whether an Active membership
  becomes Partial when invoiced, or whether a renewal creates a new unpaid
  subscription with future dates. Known risk: in the second case, "latest end
  date wins" would treat an unpaid renewal as current and the grace period
  would never start. If live data shows this, measure grace from the end of
  the last fully paid period instead.
- Memberships start on the payment date; there are no future-dated
  memberships. Renewing extends the existing end date (about a year out).
  Renewal reminders apply only within 30 days of the end date
  (`RENEWAL_REMINDER_DAYS`), so a renewed member stops seeing them.

## TidyHQ access: mock first

SML's TidyHQ plan is at its app-integration limit until an upgrade early next year,
so the app is built against a **mock TidyHQ**.

- All TidyHQ calls go through a single `TidyClient` interface.
- Two implementations: `MockTidyClient` (in-memory seed data) and, later,
  `HttpTidyClient` (real API). Selected by the `TIDYHQ_MODE` env var
  (`mock` | `live`), default `mock`.
- Mock response shapes must follow TidyHQ's published API:
  v2 spec at https://api.tidyhq.com/v2/openapi.json, v1 spec at
  https://api.tidyhq.com/v1/openapi.json (the v1 docs pages are JavaScript
  and can't be read; the spec is the same content)
- `HttpTidyClient` (`src/lib/tidyhq/http/`) implements every `TidyClient`
  method. Its writes go through the same request layer and are **never
  retried**. **Live-only rules live in this client, not in shared code**:
  its v2 contact parser marks a missing points field (so `readPoints` says
  unreadable), and its event parser leaves `attendance_group_id` unset (so
  `findEventGroup` finds no group and check-in refuses); `readPoints` and
  `findEventGroup` stay pure and never read `TIDYHQ_MODE`. The mock does the
  opposite on both, and `getEventCheckinWindow` is always null live; the
  contract suite lists these as `ContractDifferences`. Every unresolved
  unknown is marked `LIVE-UNKNOWN(<tag>)` in the source with a go-live
  checklist item naming the same tag (`src/lib/liveUnknown.test.ts` keeps the
  two in step). **An event's attendance group is part of the event**
  (`Event.attendance_group_id`, set by the mock, never by TidyHQ), so the
  admin event page reads the event before the attendee list. **One contract
  suite** (`runTidyClientContract`, `src/lib/tidyhq/contract.ts`) runs against
  both clients, the HTTP one through a fake TidyHQ server
  (`http/fakeTidyServer.ts`, test-only, pages 2 at a time). A behavior one
  client has and the other lacks must fail a test: add new `TidyClient`
  behavior to the contract, not to one client's own test file. Mock-only
  behavior (reset, the sign-in list, copies) stays in the mock's file.
- Mock sign-in: a fake TidyHQ sign-in page that lists seed members to pick from,
  then follows the same redirect/callback flow as the real OAuth.
- Endpoints the app relies on:
  - `GET /v2/contacts/me` (identity)
  - `GET /v2/contacts/{id}/memberships` (active membership check)
  - `GET /v2/events`, `GET /v2/events/{id}` (events)
  - `GET /v2/contacts` (the colors owed report's list of every active
    contact, via `listAllContacts`; follows every page with `limit`/`offset`)
  - `GET /v2/contacts?search_terms=` (staff check-in member search, via
    `searchMembers`: 2-character minimum, 20-result cap)
  - `PATCH /v2/contacts/{id}` (points custom field)
  - `POST /v2/contacts/{id}/notes` (optional audit note)
  - `PUT /v1/groups/{groupID}/contacts/{contactID}` (attendance; v2 can't write groups)
  - `GET /v1/contacts/{contactID}/groups` (a member's groups, archived ones
    included, for recent events)
  - `GET /v1/groups/{groupID}/contacts` (an event group's members, sent
    with `show_all=true` so inactive contacts are included: check-in's
    "already checked in" test reads it, and an inactive contact can still
    sign in. Admin and volunteer access filter back to active. Identity only. v1 sends no custom field values, so read
    points with `GET /v2/contacts/{id}`, never from this list)
- Unknown until live access: how an event links to its contact group, and the
  exact request format for custom fields. Keep both isolated so they're easy to
  change. The custom field PATCH follows the spec's shape,
  `custom_fields: { <id>: { value } }`, and sends the points field only.
- `acceptsCheckIn(event)` (`src/lib/tidyhq/acceptsCheckIn.ts`) is the one rule
  for whether an event takes check-ins at all (true for every event today,
  shared ones included). It sits in `checkinBlocker` next to archived, as the
  reason `not_accepted`, so the admin event page's QR code, the volunteer page
  and check-in (`event_unavailable`) all refuse together. If the Board later
  wants partner events recorded without points, that is a separate rule added
  then.
- The points PATCH (`updateContact`) accepts any 2xx and returns nothing, like
  the group add, until go-live checklist item 13 confirms the reply: a point
  that was written is never reported as a failure over the reply's shape.

## Stack

- Next.js (App Router), React, TypeScript (strict)
- Next.js version guidance (managed by `next dev`; don't edit inside its
  markers): @AGENTS.md
- Node 24
- **No Cache Components** (`cacheComponents` is off in `next.config.ts`).
  Every page here is dynamic (cookies, TidyHQ reads), so it gives us nothing,
  and it forces `<Suspense>` around request-time data. Streamed `<Suspense>`
  content is revealed by a script, so with JavaScript off or failing (event
  Wi-Fi), members would see "Loading…" forever. Don't wrap member pages in
  `<Suspense>` or add `loading.tsx` files under `src/app`:
  `src/app/noSuspense.test.ts` fails if either appears, and the Playwright
  `webkit-no-js` project (JavaScript off) runs every spec to catch the rest.
  Revisit at the next major Next.js version, where Cache Components becomes
  the default.
- Tests: Vitest
- Mobile-first: the member side is used on phones at event doors
- Styling: Tailwind CSS v4 (PostCSS plugin, no `tailwind.config.js`). Shared
  page container lives in `src/app/layout.tsx`; light/dark colors are CSS
  variables in `src/app/globals.css`, exposed as `bg-background` and
  `text-foreground`.

## Conventions

- Plan before editing for anything beyond a small change; confirm the plan with me.
- Plans live in `docs/plans/` (one file per milestone). Mark PRs done there as
  they merge.
- Write tests for check-in rules, points calculation, and the TidyHQ client.
- Use test-driven development: write failing tests first, run them to confirm
  they fail, then implement until they pass. Don't change a test to make it
  pass unless the test itself is wrong, and explain why if you do.
- Keep the member-facing pages minimal and fast.
- Member-facing check-in and status pages must stay usable on older phones.
  Tailwind v4 targets Safari/iOS 16.4+, so keep their core function (signing
  in, checking in, reading status) working even if newer CSS features don't
  apply. Treat those features as polish, not requirements.
- Small, focused commits with clear messages.
- Do small tasks inline rather than spawning subagents, to conserve usage.

## Workflow rules

Stop points (wait for me at each):

- After a plan: present it with open questions, and don't write code until I
  approve.
- After opening a PR: summarize, lead with anything that needs my decision, and
  never merge. I merge.
- After a code review: list each finding as fix or leave-as-is with a one-line
  reason, and wait for my go-ahead.

Fixing review findings:

- Fix test-first. Evaluate each finding instead of applying it blindly; push
  back with a reason when the reviewer is wrong.
- Reply to every inline review comment with "Fixed in <commit>" or "Left as is:
  <reason>".
- After fixes, rerun the full e2e suite, not just the changed spec.

Before opening any PR, check:

- **Volunteer privacy:** volunteers see only name, points, and event-related
  verdicts, never membership standing, balances, dates, email, or rewards.
- **No dead ends:** no screen sends a member to someone (a volunteer, a Board
  member) who can't actually do what it says.
- **Navigation:** every member-facing page is reachable from the interface, not
  only by URL.
- **E2E cost:** keep new specs lean; specs that wait on real time run in one
  project only.
- **Docs:** update `docs/plans` status and CLAUDE.md when behavior changes.

Changing an existing test: say which test and why in both the summary and the
PR description.

Run the format check (`npm run format:check`) before opening the PR.

## Versioning

- We use semantic versioning. Each completed milestone bumps the minor version
  (0.3.0 for milestone 3), bug fixes between milestones bump the patch, and
  go-live with live TidyHQ is 1.0.0.
- The final PR of each milestone updates the version in `package.json` before
  merging. After it merges, I tag the release and create a GitHub Release with
  generated notes.

## Security

- Never commit secrets. Credentials live in `.env.local`, which is gitignored.
  Provide a `.env.example` with placeholder values only.
- Never log tokens, client secrets, or API keys.
- Member sessions go in secure, httpOnly cookies.

## About me

I'm learning Claude Code on this project and preparing for an engineering role.
Explain your reasoning briefly when you make design choices, and tell me what
commands to run rather than assuming I know them.
