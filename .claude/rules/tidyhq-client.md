---
paths:
  - "src/lib/tidyhq/**"
  - "src/lib/checkin/**"
  - "src/lib/auth/**"
  - "src/app/auth/**"
  - "src/app/mock-tidyhq/**"
  - "src/app/checkin/**"
  - "src/app/admin/events/**"
  - "src/app/maxDuration.test.ts"
  - "src/lib/startupConfig*"
  - "src/lib/liveUnknown.test.ts"
  - "src/instrumentation.ts"
  - ".env.example"
---

# TidyHQ client rules

- Events are created and advertised in TidyHQ, never in this app.
- Member sign-in uses TidyHQ OAuth (authorization code flow, `domain_prefix=sml`).
  The member's token is used only to identify them (`GET /v2/contacts/me`).
- All other TidyHQ calls (membership checks, group writes, points updates) happen
  server-side with an admin-level token, never from the browser.

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
  its v2 contact parser marks a missing points field and a missing
  colors-issued field (so `readPoints` and `readRewardIssued` say
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
- **Live sign-in and startup.** `HttpTidyOAuth` (`src/lib/tidyhq/http/`)
  builds the real authorize URL (`domain_prefix` from `TIDYHQ_DOMAIN_PREFIX`,
  default `sml`) and swaps the code for the member's token server-side, with
  the client secret, through `tidyTokenPost` in the request layer (never
  retried). The token only calls `GET /v2/contacts/me` and is never stored in
  a cookie, session or log; the existing state-cookie check stays. **The
  client secret, code and token never appear in a log or error**: messages
  are fixed text, never anything the server sent back (it may echo them) or a
  caught error's message. `createTidyServices("live", env)` builds both from
  `liveConfig`. `checkStartupConfig` (`instrumentation.ts`) refuses to start
  in live mode (through `createTidyServices`, which validates once) if
  `APP_ORIGIN` (https, localhost excepted; the same test as
  `configuredAppOrigin`),
  `TIDYHQ_CLIENT_ID`, `TIDYHQ_CLIENT_SECRET`, `TIDYHQ_ADMIN_TOKEN` or
  `SESSION_SECRET` (the minimum length is the session code's own,
  `sessionSecret.ts`) is missing, blank or a `.env.example` placeholder,
  naming the setting and never printing a value. **Every production start,
  demo included, also checks `SESSION_SECRET`.** The group ids
  (`ADMIN_GROUP_ID`, `HELPER_GROUP_ID`) are optional and
  never block startup; live mode logs a startup warning (no value) when
  `ADMIN_GROUP_ID` is unset. **Production refuses `TIDYHQ_MODE=mock` unless
  `DEMO_MODE=on`**, and demo mode shows a "Demo data" banner on every page
  (server-rendered, so it shows with JavaScript off); `DEMO_MODE=on` with live
  is refused. The e2e suite runs as a demo for that reason.
- **One time budget per check-in** (`src/lib/tidyhq/budget.ts`, 24 s inside
  the 30 s route limit; `maxDuration = 30` is on the two pages that hold the
  check-in forms, and a test keeps them equal). Both actions start it, so the
  volunteer access check counts, and `checkIn` starts its own if called
  without. It is ambient (`AsyncLocalStorage` on `globalThis`), read by the
  request layer through one rule (`requestTimeoutMs`): a read's timeout is
  capped to the time left, nothing is sent with 0.5 s or less left, and a
  retry is skipped without time for it. **A write is never given a shorter
  timeout**: it gets its full 8 s or isn't sent, since a write TidyHQ applied
  but we aborted would be reported as failed (a double-award or a lost point).
  So before the group add, `checkIn` requires 16 s left (`CRITICAL_WRITES_MS`,
  the group add and the points write at full timeout) or writes nothing and
  shows "temporarily unavailable, try again" (safe to retry); the reads before
  it get the other 8 s. The two check-in pages' renders have the same budget,
  so a slow TidyHQ reaches the app's own error screen, not the host's 504.
  Past the budget, a step fails like a TidyHQ outage ("temporarily
  unavailable"). **After the points write, running out of time never fails
  the check-in**: if the budget is spent, **the staff note is skipped and logged**, so
  that check-in looks like a self check-in in TidyHQ; accepted. Never
  double-awards.
- Mock seed edge cases (for e2e): Kai Mercer (only membership `expired` with
  a future end date) and Pop-up Meetup (`ev_no_group`, open now, no
  attendance group).
- Mock sign-in: a fake TidyHQ sign-in page that lists seed members to pick from,
  then follows the same redirect/callback flow as the real OAuth.
- Endpoints the app relies on:
  - `GET /v2/contacts/me` (identity)
  - `GET /v2/contacts/{id}/memberships` (active membership check)
  - `GET /v2/events`, `GET /v2/events/{id}` (events)
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
- The points PATCH (`updateContact`) accepts any 2xx and returns nothing, like
  the group add, until go-live checklist item 13 confirms the reply: a point
  that was written is never reported as a failure over the reply's shape.
