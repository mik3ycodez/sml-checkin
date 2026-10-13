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
  (logged as a staff check-in), points adjustments, simple reports.

## Out of scope for MVP

- RSVP, headcount, and capacity limits (later enhancement; events should carry a
  check-in mode field, `open` now and `rsvp_required` later)
- Payments, renewals, profile editing (TidyHQ handles these)
- Anti-gaming measures (audits instead)
- Its own database (add later only if reporting needs it)
- Warnings for invalid check-in windows (later, on admin event pages). A
  window that's half-filled, unparseable, or closes before it opens is
  silently ignored, and check-in falls back to the event's start and end.
  Admins should see a warning so they can fix it in TidyHQ.

## Key decisions

- Events are created and advertised in TidyHQ, never in this app.
- Member sign-in uses TidyHQ OAuth (authorization code flow, `domain_prefix=sml`).
  The member's token is used only to identify them (`GET /v2/contacts/me`).
- All other TidyHQ calls (membership checks, group writes, points updates) happen
  server-side with an admin-level token, never from the browser.
- Points: **1 point per event attended.** Keep point values in one config spot,
  since rules may expand later.
- Check-ins carry a **role**: `attendee` (MVP default) or `volunteer`. Volunteer
  check-ins may earn different points later; for now both earn 1 point. Model
  the role from the start so adding volunteer rules doesn't require a redesign.
- The stored TidyHQ points field is the source of truth. It includes
  balances migrated from WildApricot and (later) admin adjustments, so
  attendance is never used to recalculate or verify points.
- On a new check-in (member not already in the event's group), add the
  member to the group first, then add `POINTS_PER_CHECKIN` for their role to
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
  never overwritten. A blank field counts as 0.
- Check-ins record who, which event, when, role (`attendee` or `volunteer`), and
  method (`self` or `staff`).

## TidyHQ access: mock first

SML's TidyHQ plan is at its app-integration limit until an upgrade early next year,
so the app is built against a **mock TidyHQ**.

- All TidyHQ calls go through a single `TidyClient` interface.
- Two implementations: `MockTidyClient` (in-memory seed data) and, later,
  `HttpTidyClient` (real API). Selected by the `TIDYHQ_MODE` env var
  (`mock` | `live`), default `mock`.
- Mock response shapes must follow TidyHQ's published API:
  v2 spec at https://api.tidyhq.com/v2/openapi.json, v1 docs at
  https://docs.tidyhq.com/api/v1/introduction
- Mock sign-in: a fake TidyHQ sign-in page that lists seed members to pick from,
  then follows the same redirect/callback flow as the real OAuth.
- Endpoints the app relies on:
  - `GET /v2/contacts/me` (identity)
  - `GET /v2/contacts/{id}/memberships` (active membership check)
  - `GET /v2/events`, `GET /v2/events/{id}` (events)
  - `PATCH /v2/contacts/{id}` (points custom field)
  - `POST /v2/contacts/{id}/notes` (optional audit note)
  - `PUT /v1/groups/{groupID}/contacts/{contactID}` (attendance; v2 can't write groups)
- Unknown until live access: how an event links to its contact group, and the
  exact request format for custom fields. Keep both isolated so they're easy to
  change.

## Stack

- Next.js (App Router), React, TypeScript (strict)
- Next.js version guidance (managed by `next dev`; don't edit inside its
  markers): @AGENTS.md
- Node 24
- Tests: Vitest
- Mobile-first: the member side is used on phones at event doors
- Styling: Tailwind CSS v4 (PostCSS plugin, no `tailwind.config.js`). Shared
  page container lives in `src/app/layout.tsx`; light/dark colors are CSS
  variables in `src/app/globals.css`, exposed as `bg-background` and
  `text-foreground`.

## Conventions

- Plan before editing for anything beyond a small change; confirm the plan with me.
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

## Security

- Never commit secrets. Credentials live in `.env.local`, which is gitignored.
  Provide a `.env.example` with placeholder values only.
- Never log tokens, client secrets, or API keys.
- Member sessions go in secure, httpOnly cookies.

## About me

I'm learning Claude Code on this project and preparing for an engineering role.
Explain your reasoning briefly when you make design choices, and tell me what
commands to run rather than assuming I know them.
