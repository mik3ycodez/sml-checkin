# Milestone 4: Admin pages

**Status:** In progress. PR 1 in review (#23).

## Context

Milestone 3 finished the member side (`/me`, grace period, rewards, CI).
Members can check themselves in, but the SML Board and the social coordinator
still have no pages: QR codes come from any QR generator, nobody can see who's
checked in, and a member without a phone can't be checked in at all.

This milestone adds admin sign-in, then the event pages the door needs (QR,
attendees, staff check-in), then one report.

## Decisions

### Admin access: the TidyHQ "App Admin" group

- An admin is a contact in SML's **App Admin** contact group in TidyHQ
  (already created). The Board manages who's in it, in TidyHQ; the app never
  writes to it.
- The group's id is config: `ADMIN_GROUP_ID` (placeholder in `.env.example`).
  SML's real id is in the go-live checklist below. The mock seed has its own
  App Admin group, used when `ADMIN_GROUP_ID` is unset in mock mode, so
  development needs no setup. Live mode has no default.
- Admins sign in with the same TidyHQ OAuth flow and session cookie as
  members. Being an admin is a check, not a different kind of session.
- **Checked on every admin request**, so removing someone from the group in
  TidyHQ takes effect on their next page load. Nothing about admin status is
  stored in the cookie.
- **Fails closed.** If the group can't be read (TidyHQ error, unknown group,
  `ADMIN_GROUP_ID` unset in live mode or blank), admin access is denied and
  the problem is logged (contact id and error status only, never tokens).
  The page says admin access couldn't be checked, which is different from
  "you're not an admin", so the Board knows to look at config rather than
  the group.
- The check reads the group's members (`listGroupContacts(ADMIN_GROUP_ID)`),
  not the contact's groups. A wrong or deleted group id then fails as a 404
  instead of quietly looking like "nobody is an admin", and the group is
  small (the Board plus the social coordinator), so reading it is cheap.
- Production startup does **not** require `ADMIN_GROUP_ID`. A missing admin
  setting shouldn't take down member check-in; the admin pages fail closed
  instead.

### Staff check-ins write a TidyHQ note; self check-ins don't

- A staff check-in writes a note on the member's TidyHQ contact
  (`addNote`) saying which event, which admin did it (name and contact id),
  and when (Seattle time). For example: "Checked in to Social Night
  (ev_tonight) by staff: Jordan Park (c_jordan), 2026-10-14 7:32 PM".
- Self check-ins write no note. The event group already records who and
  which event, so a check-in without a note was a self check-in.
- **Known gap, accepted:** a self check-in's time isn't recorded. TidyHQ's
  API documents no timestamp for group membership. See "Open questions for
  go-live" for what to check with live access.
- The note is written last, after the points write. A failed note is logged
  (contact and event ids, the error status) and the check-in still succeeds.
  It never changes points, and nothing retries it.
- Only a new check-in writes a note. If the member was already in the group,
  nothing is written, just as no points are awarded.

## Design choices (and why)

- **Admin pages follow the member pages' no-JavaScript rule.** Door staff use
  phones too. No `<Suspense>` or `loading.tsx` (`noSuspense.test.ts` already
  covers all of `src/app`), forms are plain forms, and `webkit-no-js` runs the
  admin specs too.
- **The QR code is an SVG rendered on the server** (the `qrcode` npm package),
  so it shows without JavaScript and prints sharply at any size.
- **The attendee list refreshes with `<meta http-equiv="refresh">`** (every
  30 seconds), not client polling. It works with JavaScript off and needs no
  API route.

## Pull requests (draft order)

### PR 1: Admin access rule (test-first) 🔍 In review (#23)

- `src/lib/auth/admin.ts`: `adminAccess(client, contactId, groupId)` returns
  `admin` (with the name), `not_admin`, or `unavailable`, plus
  `adminGroupId(env, mode)`: the mock seed's group by default in mock mode,
  nothing in live mode, and an id with anything but letters, digits, `_` and
  `-` counts as unusable, so it can't alter a request path later.
  `unavailable` is logged (contact id and TidyHQ's status and message; for a
  non-TidyHQ error, only its name).
- `src/app/admin/requireAdmin.ts`: for admin pages and actions. No session
  redirects to sign-in with `returnTo`. `not_admin` and `unavailable` come
  back as a `denied` result and the page renders `AdminDeniedScreen` with
  its own message. _(Built: not Next's `forbidden()`, which is experimental
  (`authInterrupts`) and renders one fixed page, so it can't tell the two
  apart. The cost: the denied page has status 200, not 403. It shows nothing
  private.)_
- `/admin` is a placeholder (heading and who's signed in) so the guard has
  something to protect; PR 2 fills it in.
- Seed: an App Admin group (`grp_app_admin`) with a new Board member, Casey
  Moreno, in it. Existing members don't change.
- `.env.example`: `ADMIN_GROUP_ID`, and `CLAUDE.md` records the decision.
- Tests: the rule (admin, member, unknown contact, read on every call,
  failure, unknown group, unset id, a non-TidyHQ error that must not log its
  message), id parsing, the screens, and Playwright (sign in and land on
  `/admin`; a member is turned away) in all three projects. "A removal takes
  effect on the next load" is the unit test that the group is read every time;
  an end-to-end version would need another mock-only route.
- Housekeeping: `milestone-3.md` still showed PR 11 as in review; marked done
  (#22).
- `CLAUDE.md`: the "Check-ins record" bullet now says what's recorded (see
  Decisions), and the admin decision is added.

### PR 2: `/admin` event list

- `/admin`: upcoming and recent events from `listEvents`, each linking to
  `/admin/events/<id>`. Events with no attendance group are listed but marked.
- Playwright: the admin sees the list; a member gets the denied screen; signed out
  goes to sign-in and comes back.

### PR 3: Event page with QR code and window warnings

- `/admin/events/<id>`: name, time, check-in window, the check-in URL
  (`APP_ORIGIN/checkin/<id>`) as text, and its QR code.
- Warns about an invalid check-in window (half-filled, unparseable, closes
  before it opens) and says check-in is using the event's start and end. The
  rule lives in `checkinWindow.ts`; this exposes why a window was ignored
  instead of only ignoring it.
- `CLAUDE.md`: drop the warnings bullet from "Out of scope for MVP".

### PR 4: Live attendee list

- On the event page: attendee names and a count from `listGroupContacts`,
  refreshed every 30 seconds.
- Method and time aren't shown (that would mean a notes read per attendee).

### PR 5: Contact search in `TidyClient`

- `searchContacts(query)` (`GET /v2/contacts?search_terms=`), mock included,
  following all pages. Tests for name matches, no matches, and case.

### PR 6: Staff check-in

- From the event page: search by name, pick a member, see their assessment
  (`assessCheckIn`: standing, already checked in, or why they're refused),
  then confirm. Confirming runs `checkIn` with `method: "staff"` and the
  admin's contact, so it uses the same rules and points as self check-in.
- `checkIn` (test-first): for a new staff check-in, write the note last, as
  described under Decisions. Tests: the note's text; no note for self
  check-ins; no note when already checked in; a failed note still returns
  `checked_in` with the same total; the note comes after the points write.
- Inconsistent membership records (`findInconsistentMemberships`) show in
  this member view, so staff can see why a member was refused: an `expired`
  membership with a future or missing end date, or an end date the app can't
  read. Ids only, no tokens.
- The server action calls `requireAdmin()` itself; a page check alone doesn't
  protect an action.
- `CLAUDE.md`: the "Check-ins record" bullet changes to: staff check-ins write
  a note (event, admin, time); self check-ins are recorded by the group alone.
  Remove "Not saved yet" from `CheckInInput.method`'s comment.

### PR 7: Club colors owed report, and 0.4.0

- `/admin/reports/colors`: members at 18+ points not marked issued, using
  `rewardStatus` and `readRewardIssued` (as `/me` does), with their membership
  standing. Unreadable points or issued fields are listed separately as
  "needs checking". A supplemental cross-check: TidyHQ auditing stays the
  official record, and the app never marks colors issued.
- Needs a "list all contacts" read (`GET /v2/contacts`, all pages).
- `package.json` to 0.4.0.

**Dependencies:** PR 1 goes first, since everything after it needs
`requireAdmin()`. PRs 2→3→4 are the event page. PR 5 comes before PR 6. PR 7
can go any time after PR 1, but it's last because it carries the version bump.

## Deferred

- **Cheaper "already checked in" check** (`listContactGroups` instead of
  downloading the event's whole attendee list): to the live-TidyHQ milestone.
  It's only safe once live TidyHQ confirms the endpoint includes archived
  groups and is as fresh as the group list right after a group add. Getting
  that wrong double-awards points, and the mock can't tell us. Keep the
  contact-before-group read order when it's done.
- **Points adjustments** (CLAUDE.md's admin side): to milestone 5. It
  writes the points source of truth and needs its own reason and audit design.
- **Org-wide inconsistent-memberships report**: one memberships read per
  contact. In this milestone they show only in the staff check-in member view.
- **Method and time in the attendee list.**

## Future enhancements

- **Scan TidyHQ ticket QR codes for paid events.** Paid events already issue
  tickets with QR codes in TidyHQ; staff could scan them at the door. Not
  designed yet, and it would bring back some of the ticket and RSVP ideas
  this app leaves out for now.

## Open questions for go-live

TidyHQ's API documents no timestamp for group membership, so a self
check-in's time isn't recorded (an accepted gap, see Decisions). With live
access, check:

1. **Does the contact's "Notes & activity" panel in TidyHQ show group adds
   with a time?** If it does, the time of a self check-in can be read there by
   hand, with no code.
2. **Could the `contact.group.added` webhook's "created" timestamp record
   check-in times?** TidyHQ keeps events for 30 days, so keeping them longer
   would need this app to receive and store them, which means adding a
   database. Weigh it against reporting needs when the database question
   comes up.

## Go-live checklist (live TidyHQ)

Production settings. Secrets go only in the host's secret store or
`.env.local`, never in git, logs, or this file.

| Setting                | Secret?                                          | Production value                                                                                                                                |
| ---------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `TIDYHQ_MODE`          | No                                               | `live` (startup refuses to run without it)                                                                                                      |
| `APP_ORIGIN`           | No                                               | The site's https address. Register `APP_ORIGIN/auth/callback` as the OAuth redirect URI in TidyHQ. Changing it later means reprinting QR codes. |
| `TIDYHQ_CLIENT_ID`     | No (sent in the sign-in URL), but keep it in env | From SML's TidyHQ app registration                                                                                                              |
| `TIDYHQ_CLIENT_SECRET` | **Yes**                                          | From SML's TidyHQ app registration                                                                                                              |
| `TIDYHQ_DOMAIN_PREFIX` | No                                               | `sml`                                                                                                                                           |
| `TIDYHQ_ADMIN_TOKEN`   | **Yes**                                          | Admin-level token for server-side calls                                                                                                         |
| `SESSION_SECRET`       | **Yes**                                          | A new value (`openssl rand -base64 32`). Don't reuse the mock one: rotating it at the switch signs out sessions holding mock contact ids.       |
| `ADMIN_GROUP_ID`       | No (an id, not a credential)                     | **`221914`**, SML's App Admin group. Set it when live TidyHQ is connected.                                                                      |
| `E2E`                  | No                                               | **Must be unset.** It enables the mock reset route (which also needs mock mode).                                                                |

Not env settings, but they must change in code before go-live (each lives in
one file on purpose):

- `POINTS_FIELD_ID` and `COLORS_ISSUED_FIELD_ID` in
  `src/lib/tidyhq/customFields.ts`: the real TidyHQ custom field ids, and the
  real value format of the issued field.
- `EVENT_GROUPS` in `src/lib/tidyhq/eventGroups.ts`: how an event links to its
  attendance group.
- `getEventCheckinWindow`: where the check-in window lives in TidyHQ.
- Verify against live data: `listContactGroups` includes archived groups, and
  how renewal invoices look (see CLAUDE.md, "Unverified assumptions").
