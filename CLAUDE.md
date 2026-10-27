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

## Invariants

These live only here, so they always load. A rules file that continues one
says so.

- **The app edits nothing in TidyHQ beyond a check-in.** It writes exactly
  three things, all during a new check-in, in this order: the member's place
  in the event's group, `POINTS_PER_CHECKIN` added to the stored total, and
  the staff note (staff check-ins only, always last).
- A failure between the group add and the points write may miss a point, but
  must never double-award.
- The stored TidyHQ points field is the source of truth.
- Admin and volunteer access fail closed: if a group can't be read, nobody is
  let in.
- **The client secret, code and token never appear in a log or error**: messages
  are fixed text, never anything the server sent back (it may echo them) or a
  caught error's message.
- **Production refuses `TIDYHQ_MODE=mock` unless `DEMO_MODE=on`**, and demo mode
  shows a "Demo data" banner on every page (server-rendered, so it shows with
  JavaScript off); `DEMO_MODE=on` with live is refused.
- **Never set `E2E` on the demo.** It opens the unauthenticated
  `/mock-tidyhq/reset` route and speeds the admin refresh up to 2 s.
- **Exactly one instance**: the mock keeps its state in memory, so no scale
  out and no PM2 cluster mode.

## Detailed rules

Path-scoped files in `.claude/rules/` load when Claude reads or edits a matching
file, not from a pasted diff: read the matching one before changing or reviewing.

- `checkin-points.md`: check-in, points, check-in window, archived events, QR
  codes, what a check-in records, `acceptsCheckIn`.
- `membership-rewards.md`: membership standing, grace period, rewards and colors,
  contact status, Seattle-time dates.
- `admin-access.md`: the admin group, check-in volunteers, the attendee list.
- `tidyhq-client.md`: `TidyClient`, mock vs live, contract suite, live sign-in and
  startup, time budget, endpoints.
- `app-pages.md`: no Cache Components or `<Suspense>`, `/me` links, `contactName`.
- `azure-demo.md`: the Azure host, deploy check, the `/demo` page.

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
- Reply to AND resolve every inline review comment with "Fixed in <commit>" or
  "Left as is: <reason>".
- After fixes, rerun the full e2e suite, not just the changed spec.

Shell commands:

- Never use heredocs or `cat >` in shell commands (they hang waiting for
  input). Write files with the Write tool, and run `gh pr create`
  non-interactively with `--title` and `--body-file`.

Before opening any PR, check:

- **Volunteer privacy:** volunteers see only name, points, and event-related
  verdicts, never membership standing, balances, dates, email, or rewards.
- **No dead ends:** no screen sends a member to someone (a volunteer, a Board
  member) who can't actually do what it says.
- **Navigation:** every member-facing page is reachable from the interface, not
  only by URL.
- **E2E cost:** keep new specs lean; specs that wait on real time run in one
  project only.
- **Docs:** update `docs/plans` status and CLAUDE.md or the matching
  `.claude/rules/` file when behavior changes.

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
