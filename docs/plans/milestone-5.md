# Milestone 5: Live-ready prep

**Status:** Approved. PRs 1 (#34), 2 (#35), 3 (#36) and 4 (#37) merged.
Re-planned after PR 4: colors eligibility moves into TidyHQ, the colors
report is removed, and the inconsistent memberships report is dropped
(PR 5, this change).

## Context

Milestones 1 to 4 built the whole app against `MockTidyClient`. SML's TidyHQ
plan is at its app-integration limit until an upgrade early next year, so we
still can't call the real API. This milestone gets everything ready for that
day: a real `HttpTidyClient` and live sign-in, built and tested against the
published API with no real network; startup config that fails closed; and
moving the club colors list out of the app and into a TidyHQ group.

When this milestone is done, going live should be: register the app in
TidyHQ, set the env settings, verify the go-live checklist against live data,
and change only the files the checklist names.

Not in this milestone: anything that needs live access to decide (the event
to group link, the custom field format, the check-in window source, the
"already checked in" shortcut). Those stay isolated and on the checklist.

## Decisions

### The app never edits TidyHQ records beyond check-in

Decided before this plan. The app writes exactly four things, all during a
new check-in, in this order:

1. adds the member to the event's attendance group,
2. adds `POINTS_PER_CHECKIN` to the stored points total,
3. adds the member to the "App Color Eligible" group, when they qualify
   (see below; decided in PR 5, built in PR 7),
4. writes the staff note (staff check-ins only), always last.

Points corrections and every other change to member data happen in TidyHQ,
by people SML appoints. **Admin points adjustments are dropped, not
deferred.** Reasons: the stored points field is the source of truth, and
TidyHQ already has the permissions, history and audit that a correction
needs; building a second place to edit it would need its own reason and audit
design, for something the Board can already do.

PR 1 records this in CLAUDE.md and the milestone 4 plan.

### Colors eligibility lives in TidyHQ (decided after PR 4)

The app reports nothing org-wide. The Board's list of who is owed club
colors is a TidyHQ contact group, "App Color Eligible" (id `222071`, in
`COLORS_GROUP_ID`), which check-in keeps filled. The app only records that a
member reached 18+ points through check-in; it never decides who receives
colors.

- **The rule (self-healing).** On a **new** check-in (never on "already
  checked in"), after a successful points write, add the member to the
  colors group if all of these hold:
  1. the new total is at least the club colors threshold (`REWARDS` in
     `points.ts`, 18),
  2. `readRewardIssued` (from the contact read before the writes) is
     readable and not issued,
  3. they aren't already in the group (`isInGroup` on the colors group,
     which stays small: it holds only people still owed colors).

  It runs on every qualifying check-in, not only the one that crosses 18,
  so a member missed once (a failed add, the group set up after they
  passed 18) is added at their next check-in.

- **Skips, logged with the contact id only:** the points write failed,
  the issued field is unreadable, or `COLORS_GROUP_ID` is unset or invalid
  in live mode. Mock mode falls back to a seed group, like `ADMIN_GROUP_ID`
  and `HELPER_GROUP_ID` (`groupFromSetting`).
- **Never fails a check-in.** A failed "already in the group" read skips
  the add; a failed add is not retried. Both are logged and swallowed, like
  the staff note: the member is checked in and has their point, and it
  never touches points.
- **Same for self and staff check-ins.** The staff note stays the last
  write, after the colors add.
- **Membership standing is not part of the rule** (decided in review).
  Check-in only succeeds for current, grace and balance-due members, so
  those are who get added. Colors still need a current, fully paid
  membership: the Board checks good standing, balances and current
  membership in TidyHQ before handing them out. `/me` keeps telling the
  member to renew or pay first.
- **The Board's process:** hand over the colors, mark the colors-issued
  field in TidyHQ, then remove the member from the group. Issued is the
  record that they received them; the group is the to-do list. Removing
  someone without marking issued means their next check-in adds them back.
- **The colors owed report is removed** (`/admin/reports/colors`, the admin
  home "Reports" link, `getColorsOwed`), and with it `listAllContacts`
  (nothing else uses it). `/me` and the check-in confirmation are
  unchanged: the app still reads the issued field and shows the member's
  progress.
- **The inconsistent memberships report is dropped** from this milestone
  (it was PR 7, with `listAllMemberships`). The inconsistent-membership
  warnings in the admin staff check-in view stay.

### `HttpTidyClient` rules

- **Two tokens, never mixed.** The member's OAuth token is used for exactly
  one call, `GET /v2/contacts/me`, and nothing else. Every other call uses
  `TIDYHQ_ADMIN_TOKEN`, server-side. Both go in an
  `Authorization: Bearer <token>` header, never in a URL (v1 also accepts an
  `access_token` query parameter; we don't use it, because URLs end up in
  logs).
- **Fixed hosts.** `https://api.tidyhq.com/v2`, `https://api.tidyhq.com/v1`
  and `https://accounts.tidyhq.com/oauth/...` are constants. Tests inject a
  `fetch` function through the constructor; there is no env setting for the
  API base URL, so a bad setting can't send the admin token to another host.
- **Every list follows every page.** v2 lists are plain arrays with
  `limit`/`offset` and no total. The client asks for 100 per page and stops
  only at an **empty page**, not a short one: if TidyHQ caps the page size
  below what we ask for, "stop at a short page" would silently return one
  page as if it were everything. That costs one extra request per list and
  is worth it (a missing page of an event group would award points twice).
  Results are de-duplicated by id. A hard cap (200 pages) throws instead of
  returning a partial list.
- **Errors become `TidyError`, always.** HTTP statuses pass through as
  `TidyError(status)`: 401, 403, 404, 422, 429, 5xx. Our own failures get
  gateway statuses so callers can treat them like TidyHQ being down: timeout
  → 504, network error → 502, a 2xx with a body that isn't the expected
  JSON shape (not an array where a list is expected, no `id` on a record) → 502. A 401 on the admin token is logged as a configuration problem ("admin
  token rejected"), since it means the token is wrong or expired, not that a
  member did something.
- **Timeouts suited to event Wi-Fi.** The weak link is the member's phone to
  our server, so our server must answer quickly with a clear "try again"
  rather than hang while the phone gives up. Each TidyHQ request gets 8
  seconds (`REQUEST_TIMEOUT_MS`, one constant, `AbortSignal.timeout`).
- **Retries: reads once, writes never.** A `GET` that times out, fails on
  the network, or gets 502/503/504 is retried once after a short pause. 429
  is not retried (it's TidyHQ asking us to slow down; the page says
  "temporarily unavailable"). Writes are never retried automatically: a
  retried note would be written twice, and a group add or points write that
  timed out may have happened anyway. That matches the existing rule: a
  failure between the group add and the points write may miss a point, but
  never double-awards. The member's next tap finds them in the group and
  awards nothing.
- **Never log secrets.** Log lines and error messages carry the method, the
  path with ids (contact and event ids are already logged elsewhere), the
  status, and TidyHQ's `message` field cut to 200 characters. Never headers,
  tokens, OAuth codes, client secrets, request bodies, or query strings
  (`search_terms` holds members' names). A test drives every error path with
  a recognizable fake token and secret and fails if either appears in any
  thrown message or console output.
- **A blank search sends nothing.** `searchContacts("")` returns `[]` without
  calling TidyHQ, since a blank `search_terms` may well mean "everyone".
- **Our ordering and filters, not TidyHQ's.** `listEvents` sends
  `after`/`before` (the spec's meaning matches ours: ends after, starts
  before) and then still sorts by start time itself, as the mock does,
  because the spec doesn't promise an order.

### The known unknowns stay in one place each

Each gets a marked comment (`// LIVE-UNKNOWN:`), so
`grep -rn LIVE-UNKNOWN src` lists every one, and a go-live checklist item.

1. **How an event links to its attendance group:** `eventGroups.ts`, as
   now. Until it's verified, **live mode links no event to a group**, so
   every live event shows "no attendance group" on the admin page and refuses
   check-in. That fails closed. The tempting guess, the spec's
   `Event.group_id`, is a group "kept in step with the event's attendees"
   (ticket holders). If TidyHQ's sync removes a member we added, their next
   scan would look like a new check-in and award a second point, which
   breaks the one rule we must never break. So we don't guess. The mock keeps
   its explicit map.
2. **The custom field request format:** `customFields.ts`, as now.
   `HttpTidyClient.updateContact` sends the body `buildPointsPatch` builds,
   unchanged, so the format lives in one file. The spec says the PATCH body
   is a `Contact`, which suggests `custom_fields: { <id>: { value } }` rather
   than our current `{ <id>: "<value>" }`; PR 4 follows the spec's shape and
   the checklist verifies it. The field ids (`POINTS_FIELD_ID`,
   `COLORS_ISSUED_FIELD_ID`) stay placeholders until go-live.
3. **Also unknown, and not in your list:** where the admin-set **check-in
   window** lives in TidyHQ (`getEventCheckinWindow`). Live mode returns
   `null` (no window set), so check-in uses the event's own start and end,
   which is the existing fallback. Marked the same way. If TidyHQ's event
   data turns out to carry check-in times, live mode uses them instead; that's
   go-live checklist item 4.

### Decisions settled in review

1. **Hosting stays a go-live decision.** Build to work on a long-running Node
   server or serverless. Set a 30-second limit (`maxDuration`) on the check-in
   and report routes regardless, since a check-in makes several TidyHQ calls
   and an 8 s timeout with one retry could outlast a serverless default.
2. **In live mode, a points field missing from the response is unreadable**
   (check-in refused with `points_unreadable`, field never written), until
   the go-live checklist confirms how TidyHQ sends unanswered fields. A blank
   value still counts as 0. This protects against the admin token not seeing
   the field (a real balance overwritten with 1). Recorded in CLAUDE.md.
   Mock mode keeps treating a missing field as blank.
3. **Check-in times:** if TidyHQ's event data provides check-in times, live
   mode uses them; otherwise it falls back to the event's start and end.
   Go-live checklist item.
4. **Production refuses `TIDYHQ_MODE=mock`** unless an explicit demo setting
   (`DEMO_MODE=on`) is set. Demo mode shows a visible "Demo data" banner on
   every page.
5. **Shared events count for points like any other.** Any event that appears
   in SML's TidyHQ is point-applicable, including ones with `shared_from` set.
   The rule lives in one small named function, `acceptsCheckIn(event)`, part of
   `checkinBlocker` (so check-in, the QR page and the volunteer page agree),
   so it's easy to change later. Go-live
   checklist: confirm no events have `shared_from` set. Future enhancement
   below.
6. **Retries:** reads once, writes never (as in the `HttpTidyClient` rules).
7. **No test TidyHQ organisation is available,** so the checklist runs on
   go-live day, ordered to keep that day safe: read-only checks first, then
   one test check-in on a Board member's own contact at an unpublished test
   event, verified in TidyHQ, before members use the app.

### Startup config fails closed in live mode

`TIDYHQ_MODE=live` refuses to start, in any `NODE_ENV`, unless
`TIDYHQ_CLIENT_ID`, `TIDYHQ_CLIENT_SECRET` and `TIDYHQ_ADMIN_TOKEN` are set,
not blank, and not the `.env.example` placeholder text. The error names the
missing setting, never a value. Live mode also refuses to start with `E2E`
set. `APP_ORIGIN` and `SESSION_SECRET` keep their current rules.
`ADMIN_GROUP_ID` and `HELPER_GROUP_ID` stay optional, as decided in milestone
4: a missing admin setting must not take down member check-in.
`COLORS_GROUP_ID` is optional for the same reason: unset, check-in works
and skips the colors add (logged each time).

`NODE_ENV=production` with `TIDYHQ_MODE=mock` also refuses to start, unless
`DEMO_MODE=on` (decision 4).

## Design choices (and why)

- **One request layer, then thin methods.** `tidyRequest` (in
  `src/lib/tidyhq/http/`) owns the auth header, timeout, retry, error
  mapping, paging and safe logging. Each `HttpTidyClient` method is then a
  few lines naming a path. The hard parts get tested once, thoroughly.
- **A fake TidyHQ server, built over the mock.** For tests, a `fetch`
  function that answers TidyHQ's paths (v1 and v2) by calling a
  `MockTidyClient` and wrapping the result the way the spec says: JSON
  bodies, `limit`/`offset` paging, Bearer token checks, `{ "message" }` error
  bodies. It pages at **2 items** by default, so every seed list spans
  several pages; that's how the paging rule finally gets tested (the mock
  alone can't page). It can also inject failures (a status, a timeout, a
  non-JSON body) on a chosen request.
- **A shared contract suite.** `runTidyClientContract(name, makeClient)` is
  one set of tests that runs twice: against `MockTidyClient` directly, and
  against `HttpTidyClient` talking to the fake server. Same seed, same
  expectations, so the two can't drift: if the mock learns a behavior, the
  HTTP client has to match it, and the reverse. Because the fake server sits
  on the mock, the contract checks the HTTP client's translation (paths,
  paging, auth, errors), and the go-live checklist checks the mock's
  assumptions against real TidyHQ.
- **Plus fixture tests from the spec's shapes.** Hand-written responses
  copied from the spec's schemas (a v2 `Contact` with `custom_fields`, a
  `Membership`, an `Event` with `group_id` and `shared_from`, an `Error`)
  check that the client reads the real field names, including nulls the
  mock never produces.
- **Report removal and the colors write are two PRs.** The removal is pure
  deletion across the client interface, both clients, the contract, a page
  and an e2e spec; the colors write is new check-in behavior. Apart, each
  diff reviews on its own terms, and the removal can't hide a behavior
  change. Removal goes first, so the later PRs (the time budget in
  particular) no longer plan around a report.
- **Seed changes are separate from new screens.** Adding a seed member or
  event can change counts and lists other specs assert on, so that churn
  lands in its own PR, reviewed on its own.

## Pull requests (in order)

### PR 1 ✅ Done (#34): Docs: the app edits nothing beyond check-in

- CLAUDE.md: remove "points adjustments" from the admin side and from the
  points rule ("(later) admin adjustments" becomes corrections made in
  TidyHQ); add the rule under Key decisions: the app writes only the group
  add, the +1 point and the staff note; corrections and all other member
  data changes happen in TidyHQ by appointed people.
- `docs/plans/milestone-4.md`: in Deferred, change "Points adjustments" to
  dropped, with the reason. Also fix its stale status line (PR 7 merged as
  #32, so milestone 4 is complete in 0.4.0).
- `docs/plans/milestone-5.md` itself, with review decisions applied.
- No code.

### PR 2 ✅ Done (#35): TidyHQ request layer (test-first)

- `src/lib/tidyhq/http/request.ts`: `tidyRequest` and `tidyRequestAll`
  (paging), following the rules above: Bearer header, fixed hosts, 8 s
  timeout, one retry for reads, error mapping (including 404, 429, timeout
  504, network 502, bad body 502), empty-page paging stop with the page cap
  and de-duplication, safe logging.
- Tests with fake `fetch` responses only: every status, timeout, network
  error, non-JSON body, paging over several pages, a server that caps page
  size, the page cap, retry once and only for reads, and the secrets test.
- No `TidyClient` methods yet; nothing uses it.

### PR 3 ✅ Done (#36): `HttpTidyClient` reads, the fake server, and the contract suite

- `src/lib/tidyhq/http/fakeTidyServer.ts` (test-only) and
  `src/lib/tidyhq/contract.ts` (`runTidyClientContract`).
- Move the behaviors `MockTidyClient.test.ts` already pins down (404s, 401
  for a bad token, active-only lists, blank search) into the contract where
  they're about the interface, and keep mock-only ones (reset, sign-in list)
  where they are. Moved tests are listed in the PR description.
- `HttpTidyClient`: `getMe`, `searchContacts`, `listAllContacts`,
  `getContact`, `getMemberships`, `getMembershipLevel`, `listEvents`,
  `getEvent`, `listGroupContacts`, `listContactGroups` (v1 for the group
  endpoints). Fixture tests from the spec's shapes.
- **v1 paging, confirmed.** The v1 docs pages are JavaScript-rendered, but
  TidyHQ publishes v1's OpenAPI spec at `https://api.tidyhq.com/v1/openapi.json`.
  Both `GET /v1/groups/{id}/contacts` and `GET /v1/contacts/{id}/groups` take
  `limit` and `offset` and return a plain array, like v2, so `tidyRequestAll`
  works for them unchanged. Live behavior (order stability, page cap) stays
  on the go-live checklist (item 7).
- **Where the mock disagreed with the specs, and what changed.**
  1. `Group` claimed `archived` and `updated_at`; v1 sends neither (and sends
     `contacts_count` for `size`, a numeric `id`, and `2012-12-16 21:01:22
+0000` times). Both fields are gone from the type, the mock and the
     seed; nothing read them. The client converts the rest.
  2. `listGroupContacts` returned inactive contacts, but v1 leaves them out
     unless `show_all=true` is sent. This first looked like a mock bug to
     fix by filtering; review found it was the other way round. Check-in's
     "already checked in" test (`isInGroup`) reads this list and never looks
     at the contact's status, so leaving inactive contacts out would let an
     inactive contact with a counted membership tap again and again for a
     point each time. So the client sends `show_all=true`, the mock keeps
     them, the contract requires them, and admin and volunteer access
     (`readGroupMembers`) filter back to active, so a deactivated Board
     member or volunteer stays locked out.
  3. `listGroupContacts` returned populated custom fields and notes; v1's
     contact list carries `custom_fields` as a list of definitions with no
     `value`, and no notes. The mock now returns identity only, and the
     parser never invents a value (a field without one is left out), so a
     points total is only ever read from `getContact`. Nothing in the app
     read points from a group list.
  4. `Event` lacked the spec's `group_id` and `shared_from`. They are now
     optional fields on the type, read but not used yet (PR 4).
- **Policy: contact status is not a check-in gate** (decided in review).
  Check-in does not refuse inactive contacts; membership standing stays the
  only gate. An archived contact with a counted membership is a data issue
  for the Board to fix in TidyHQ. Admin and volunteer access still require an
  active contact. Go-live check 12g looks for such contacts.
- **Choices made where the specs are silent** (each is reviewed in the PR):
  an event with no `archived` flag is treated as archived (check-in refuses
  it); a membership with a state outside the five known ones is treated as
  `pending`, which never counts (and is logged); a missing `public` is false.
  All three fail toward refusing check-in, never toward allowing it.

### PR 4 ✅ Done (#37): `HttpTidyClient` writes, and the unknowns marked

- `updateContact` (`PATCH /v2/contacts/{id}`), `addNote`
  (`POST /v2/contacts/{id}/notes`), `addContactToGroup`
  (`PUT /v1/groups/{groupID}/contacts/{contactID}`), and
  `getEventCheckinWindow` (returns `null` in live mode, marked).
- `buildPointsPatch` moves to the spec's `Custom-Field` body shape, with the
  mock accepting the same shape (contract covers it).
- `eventGroups.ts`: a live-mode rule that links no event, marked. Tests that
  check-in, the QR page and the volunteer page all report "no attendance
  group" for a live event, which they already agree on via `checkinBlocker`.
- Tighten the write responses once known: `tidyRequest`'s `expect: "none"`
  (any 2xx body accepted) becomes the real shape for each write, as soon as
  go-live checklist item 16 (what the v1 group `PUT` returns) is confirmed.
- Contract additions: group add is idempotent, an unknown custom field is
  422, a note on an unknown contact is 404, writes are never retried.
- `acceptsCheckIn(event)` (decision 5): returns true for every event, in one
  small file, used by `checkinBlocker` and so by check-in, the QR page and the
  volunteer page. Tests cover all three, including an event with `shared_from`
  set.
- Live mode reads a points field missing from the response as unreadable
  (decision 2). Tests: missing key refuses with `points_unreadable` and
  writes nothing; blank still counts as 0.
- Every `LIVE-UNKNOWN` marker gets a test that names it, so removing a
  marker without resolving it is visible in review.

**As built** (where it differs from or settles the list above):

- **The two live-only rules live in `HttpTidyClient`,** not in `readPoints` or
  `findEventGroup` (which stay pure, with no mode parameter and no
  `TIDYHQ_MODE` read). The v2 contact parser puts a marker value on a missing
  points key (`LIVE-UNKNOWN(missing-points-field)`); the event parser leaves
  `Event.attendance_group_id` unset (`LIVE-UNKNOWN(event-group-link)`). The
  mock sets `attendance_group_id` from its seed and treats a missing points
  field as blank. The contract suite pins both as `ContractDifferences`.
- **Cost of the event-carried link:** the admin event page used to start the
  attendee read alongside the event read, because the group depended only on
  the id. It now reads the event first, so the page makes one more serial
  TidyHQ round trip. The page test that pinned the old overlap was changed.
- **Write responses:** `addNote` expects a record (the spec defines a `Note`).
  `updateContact` accepts any 2xx and returns nothing, until checklist item 13
  confirms the PATCH reply. `addContactToGroup` keeps accepting
  any 2xx (`LIVE-UNKNOWN(group-put-response)`): v1's spec says 204, but the
  plan ties tightening it to checklist item 16.
- **`getEventCheckinWindow`:** neither spec has check-in times on an event, so
  live returns null without a request (`LIVE-UNKNOWN(checkin-window)`) and
  check-in uses the event's start and end. It therefore no longer 404s an
  unknown event on its own; every caller reads the event too.
- **`acceptsCheckIn(event)`** (renamed from `countsForPoints` in review) is true
  for every event. It is in `checkinBlocker` next to archived, as
  `not_accepted`; check-in refuses it as `event_unavailable`, and the agreement
  between the QR page, the volunteer page and check-in is tested. The admin
  event list carries nothing for it.
- **Colors owed report, live:** if checklist item 2 finds TidyHQ omits unanswered
  fields, every contact without points would land in the report's "Needs
  checking" list (the missing-points marker). Left as is; the report is
  removed in PR 6.
- **`src/lib/liveUnknown.test.ts`** lists every marker tag and checks each has a
  checklist item here naming it.

### PR 5 ✅ Done (#38): Docs: colors eligibility moves into TidyHQ

- This plan: the colors decision above, the report removal, the dropped
  memberships report, the PRs re-split, and the go-live items.
- CLAUDE.md: the write rule becomes four writes (event group add, +1 point,
  colors-eligible group add, staff note). The rest of CLAUDE.md (the colors
  report section, `GET /v2/contacts` for `listAllContacts`) changes with the
  code in PRs 6 and 7, so it never describes behavior that isn't there.
- No code.

### PR 6 🔍 In review: Remove the colors owed report

- Delete `/admin/reports/colors` (page, screens, tests), the admin home
  "Reports" link and `COLORS_REPORT_PATH`, `getColorsOwed` and its tests,
  and `e2e/colorsReport.spec.ts`.
- Remove `listAllContacts` from `TidyClient`, `MockTidyClient`,
  `HttpTidyClient`, the fake server's `GET /v2/contacts` list route (the
  search route stays), the contract suite, and the client and fixture
  tests that call it. The fixture test that reads a missing points field
  through `listAllContacts` moves to `getContact`, so the
  missing-points marker stays covered.
- Admin home tests that check the Reports link change; each is named in
  the PR description.
- CLAUDE.md: remove the colors report section and the `GET /v2/contacts`
  (`listAllContacts`) endpoint line.
- No new behavior, so no new tests; the full e2e suite still passes.

### PR 7: Colors-eligible group add at check-in (test-first)

- `COLORS_GROUP_ID` setting via `groupFromSetting`, with a mock "Eligible
  for Colors" seed group (`MOCK_COLORS_GROUP_ID`) as the mock-mode
  fallback.
- In `checkIn`, after a successful points write and before the staff note,
  the rule in the decision above. The "already in the group" read uses
  `isInGroup`; both it and the add are logged and swallowed on failure.
- Unit tests in `checkIn.test.ts`: added at 18 (crossing) and above 18
  (self-healing); not added under 18, when issued, when issued is
  unreadable, when already in the group, when the points write failed, or
  when the setting is unset in live mode; an "already checked in" tap
  touches nothing; a failed read or add still returns `checked_in` with the
  point; self and staff alike; the staff note is still written last (call
  order checked). Logs carry the contact id only.
- No new `TidyClient` behavior (it reuses `addContactToGroup` and
  `listGroupContacts`), so no contract changes. No e2e: nothing in the UI
  shows the group.
- CLAUDE.md: the colors rule and the Board's process, next to Rewards,
  including that the add is not gated by membership standing: the app only
  records that a member reached 18+ through check-in, and the Board checks
  good standing, balances and current membership in TidyHQ before handing
  out colors.

### PR 8: Live sign-in and startup config

- `HttpTidyOAuth`: `authorizeUrl` builds
  `https://accounts.tidyhq.com/oauth/authorize` with `client_id`,
  `redirect_uri`, `response_type=code`, `state` and `domain_prefix`;
  `exchangeCode` posts to `https://accounts.tidyhq.com/oauth/token`
  (`grant_type=authorization_code`, with the client secret, server-side) and
  returns the access token. TidyHQ's "bad code" response becomes
  `TidyError(401)`, as the interface promises. The code, token and secret
  are never logged. A test drives every error path with a recognizable fake
  client secret and fails if it appears in any log or thrown error,
  including when the server echoes it back in its response (PR 2's request
  layer can't cover this: it never holds the secret).
- `createTidyServices("live")` builds `HttpTidyClient` and `HttpTidyOAuth`
  instead of throwing. The mock sign-in page and reset route already refuse
  outside mock mode; a test confirms they still do.
- `liveConfig()`: the fail-closed checks above, called from
  `instrumentation.ts`. Tests for each missing, blank and placeholder
  setting.
- Production refuses mock mode unless `DEMO_MODE=on`; demo mode renders a
  "Demo data" banner in the root layout, so it shows on every page. Tests for
  both. Outside production, mock mode without `DEMO_MODE` shows no banner.
- `maxDuration = 30` on the check-in routes, plus **an overall
  time budget per operation** (check-in, including the colors group read and
  add) so the total can never
  exceed the route limit: one deadline for the whole operation, shared by
  every TidyHQ call and page in it, which also shortens or skips the retry
  when little time is left. Past the budget the operation fails with the
  same "temporarily unavailable" a TidyHQ outage shows. PR 2's per-request
  8 s timeout (plus one retry, plus paging) can otherwise add up to more than
  30 s. Past the budget after the points write, the colors add is skipped
  and logged rather than failing a check-in that worked. Test: a fake
  TidyHQ that answers slowly makes check-in fail cleanly with "temporarily
  unavailable" before the limit (fake timers, no real waiting).
- `.env.example`: every setting documented with placeholders only, including
  which are secrets, which are live-only, and that the placeholders are
  rejected in live mode. `COLORS_GROUP_ID` documented like
  `HELPER_GROUP_ID`: the "App Color Eligible" group, optional, blank for
  development (mock falls back to the seed group), and unset in live mode
  means check-in skips the colors add.
- No e2e: Playwright runs mock mode only (there is no TidyHQ to run against).

### PR 9: Mock seed additions, with e2e, and 0.5.0

- A member whose only counted membership is `expired` with a future end
  date (an inconsistent record).
- An event with no attendance group, open for check-in now.
- E2E for the screens they unlock, lean, one spec file each:
  - The no-group event: the admin event page shows the reason instead of a
    QR code; the member check-in page refuses; a volunteer can't open its
    staff page.
  - The inconsistent member: self check-in is refused; an admin's staff
    check-in view shows the inconsistent-membership warning; a volunteer
    sees only the generic line (volunteer privacy).
- Existing specs whose counts or lists change get updated; each one is
  named in the PR description with why.
- `package.json` to 0.5.0; this plan's status and CLAUDE.md updated.

**Dependencies:** PR 1 first (it's the decision). PRs 2→3→4 built the
client in order. PR 5 records the colors decision before any code. PR 6
before PR 7, so the report is gone before the group replaces it (nothing is
live, so the gap costs nothing). PR 8 after PR 7, so its time budget covers
the colors read and add. PR 9 is last because it carries the version bump.

## Deferred

- **Cheaper "already checked in" check** (`listContactGroups` instead of
  the event's whole attendee list): still waits for live data, as in
  milestone 4.
- **Short-lived group membership cache** for the admin and volunteer
  checks: only if live rate limits demand it (milestone 4's "Ideas").

## Dropped

- **Inconsistent memberships report** (was PR 7, with `listAllMemberships`
  and `GET /v2/memberships`). The app reports nothing org-wide; the
  inconsistent-membership warnings in the admin staff check-in view stay.
- **Colors owed report** (milestone 4): removed in PR 6, replaced by the
  "App Color Eligible" group in TidyHQ.

## Future enhancements

- **Shared events.** SML may share events with partner organizations; decide
  then whether shared events (`shared_from` set) are accepted for check-in
  (`acceptsCheckIn`). If the Board wants partner events recorded without
  points, that is a separate rule added then.
- **1.1: what real data taught us** (after go-live). Milestone 5 builds for
  unknowns; once live data answers them, simplify:
  - **Delete disproven branches.** For every `LIVE-UNKNOWN` answered on
    go-live day, remove the marker if confirmed, or the code path if
    disproven (and its checklist item and tests).
  - **Measure before optimizing.** TidyHQ calls and time per check-in at a
    real event, and which screens are actually used (staff check-in
    included). Optimize only what the numbers point at.
  - **Prune tests.** Remove unit tests the contract suite already covers, and
    decide which e2e specs need all three browser projects.
  - **Slim CLAUDE.md** to current rules only, moving decision history into the
    plan docs.
  - **Shrink the mock** to what local development and e2e need.

## Go-live checklist (live TidyHQ)

The milestone 4 checklist (settings table and items) still applies; it moves
here and this list adds to it. No test TidyHQ organisation is available, so
this runs on go-live day. It is ordered to keep that day safe: **Part A**
only reads, **Part B** makes one write, and members don't use the app until
both pass.

**SML's group ids** (ids, not secrets; `.env.example` keeps them blank). All
three groups exist in TidyHQ.

| Setting           | Group                   | Id       |
| ----------------- | ----------------------- | -------- |
| `ADMIN_GROUP_ID`  | App Admin               | `221914` |
| `HELPER_GROUP_ID` | App Check-In Volunteers | `221990` |
| `COLORS_GROUP_ID` | App Color Eligible      | `222071` |

### Part A: read-only checks

1. **The admin token can see the points and colors-issued fields.** The spec
   says `custom_fields` includes only answers visible to the token's
   contact. If the token can't see the points field, it would look blank,
   blank counts as 0, and the first check-in would overwrite a real balance
   with 1. Check with a contact whose balance is known.
2. **Missing versus blank** (`LIVE-UNKNOWN(missing-points-field)`). Whether a contact with no answer for a field
   omits the key or returns a blank value. Live mode currently refuses
   check-in on a missing key (decision 2); if TidyHQ omits the key for
   unanswered fields, that rule would refuse every member who has never had
   points, and `readPoints` must change.
3. **Event to group link** (`eventGroups.ts`, `LIVE-UNKNOWN(event-group-link)`). Decide how
   SML links an event to its attendance group. Proving that a contact the
   app adds stays in the group for a day after the event needs a write, so
   that part is Part B and a follow-up the next day.
4. **Check-in time fields.** Whether TidyHQ's event data provides check-in
   times (`getEventCheckinWindow`, `LIVE-UNKNOWN(checkin-window)`). If so, use them;
   otherwise keep the fallback to the event's start and end.
5. **`shared_from`.** Confirm no events have it set.
6. **Custom field ids.** Set the real ids (`POINTS_FIELD_ID`,
   `COLORS_ISSUED_FIELD_ID`).
7. Paging: on a list longer than one page (a big event group), the
   client's count matches TidyHQ's admin screen. Confirm v1's
   group endpoints page the way PR 3 implemented. **Also confirm TidyHQ's
   list order stays stable while paging** (the same order for every `offset`,
   and a member added or removed mid-read doesn't shift others). Offset
   paging can skip an item if it doesn't, and a skipped attendee would be
   checked in a second time and given a second point.
8. Errors: a wrong id gives 404, a bad admin token gives 401, and what a 429
   looks like (`Retry-After`?). Learn the real rate limit and check that a
   busy door (several check-ins a minute, plus the 30-second attendee
   refresh) stays under it.
9. The admin token: whose account it acts as (notes' author), and whether it
   expires. If it expires, a refresh flow is needed before go-live.
10. Sign-in: the real authorize and token responses, that `domain_prefix=sml`
    is right, and that a reused code is refused.
11. Events: `GET /v2/events` is marked experimental in the spec, so recheck
    its shape.
12. (Dropped with the inconsistent memberships report; number kept so
    later references hold.)

Added by PR 3 (numbered 12a to 12g so earlier references hold):

- 12a. **Archived groups.** `GET /v1/contacts/{id}/groups` has no `all`
  parameter, and the v1 spec doesn't say whether archived groups are
  listed. Check with a member who attended a past, archived event. If they
  are missing, `/me`'s recent events need another source (the v2 `Contact`
  has a `groups` array, and v2 has `GET /groups?all=true`).
- 12b. **v1 group contacts.** That the list carries no custom field values
  (we assume none; nothing relies on it either way).
- 12c. **v1 error bodies.** The v1 spec documents only 200 responses. Confirm
  an unknown group or contact gives 404 with a `{ "message" }` body, and a
  bad token gives 401.
- 12d. **Event `archived`.** That `archived` is present on every event the
  admin token reads (the spec says it is only present with access to the
  organisation's events). The client treats a missing flag as archived.
- 12e. **Membership states.** That TidyHQ only sends `activated`, `partial`,
  `expired`, `pending` and `cancelled` (the spec types `state` as a plain
  string). Any other value is logged and treated as `pending`.
- 12f. **Inactive contacts in group lists.** That `show_all=true` makes
  `GET /v1/groups/{id}/contacts` include inactive contacts (the spec lists
  the parameter; confirm it works), and that an inactive contact already
  in an event's group shows as already checked in: a second tap awards
  nothing. Also that the App Admin and App Check-In Volunteers groups
  list a deactivated member, whom the app then filters out.
- 12g. **Inactive contacts with a counted membership.** Check whether any
  inactive contacts in SML's TidyHQ hold a counted membership (activated,
  partial, or expired within the grace period). Check-in does not refuse
  them (policy above), so the Board should know who they are and fix the
  records in TidyHQ if they are mistakes.

Added by PR 5 (the colors group):

- 12h. **The App Color Eligible group.** ✅ Created in TidyHQ by the Board
  (the app never creates groups), id `222071`. Still open: set
  `COLORS_GROUP_ID=222071`, and confirm the admin token can read the group
  and add to it.
- 12i. **Seed it once.** Members already at 18+ and not issued are added
  only at their next check-in. If the Board wants them listed sooner, add
  them by hand in TidyHQ (members with no upcoming check-in otherwise stay
  off the list).

### Part B: one test check-in

On a Board member's own contact, at an unpublished test event in TidyHQ:

13. **Custom field request format** (`customFields.ts`, `LIVE-UNKNOWN(custom-field-format)`).
    Check in once, confirm the stored points value went up by exactly
    `POINTS_PER_CHECKIN`, and that the same PATCH left every other field on
    the contact unchanged (names, email, other custom fields).
14. The contact is in the test event's group, verified in TidyHQ. A second
    scan awards nothing. The next day, confirm TidyHQ's sync hasn't removed
    them (if it does, points get awarded twice).
15. A staff check-in writes its note, with the right author and content.
16. **What the v1 group `PUT` returns** (`LIVE-UNKNOWN(group-put-response)`; the response status and body for a
    new member and for one already in the group). PR 4 tightens
    `expect: "none"` to match.
    16a. **Adding a member already in the colors group is harmless:** the same
    `PUT` for someone already listed returns 2xx and changes nothing (no
    duplicate, no error). The app checks membership first, but a race
    between two check-ins can still send it. Same request as item 16, so
    check both on the test contact.
17. Real-world latency: a full check-in from a phone at the venue finishes
    well inside the 8 s per request timeout. Adjust `REQUEST_TIMEOUT_MS` if
    not.
18. `grep -rn LIVE-UNKNOWN src` comes back empty.

Then remove the test event and undo the test contact's point by hand in
TidyHQ.
