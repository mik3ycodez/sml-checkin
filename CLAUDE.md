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
- Points total is recalculated from attendance, not incremented, so retries can
  never double-count. One check-in per member per event.
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
- Node 24
- Tests: Vitest
- Mobile-first: the member side is used on phones at event doors

## Conventions

- Plan before editing for anything beyond a small change; confirm the plan with me.
- Write tests for check-in rules, points calculation, and the TidyHQ client.
- Keep the member-facing pages minimal and fast.
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
