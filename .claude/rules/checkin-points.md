---
paths:
  - "src/lib/checkin/**"
  - "src/app/checkin/**"
  - "src/app/admin/events/**"
  - "src/lib/admin/**"
  - "src/lib/tidyhq/**"
  - "src/lib/points*"
  - "e2e/checkin.spec.ts"
  - "e2e/staffCheckin.spec.ts"
  - "e2e/noGroupEvent.spec.ts"
---

# Check-in and points rules

- Points: **1 point per event attended.** Keep point values in one config spot,
  since rules may expand later.
- (Continues the invariant in CLAUDE.md.) It includes
  balances migrated from WildApricot and any corrections made in TidyHQ, so
  attendance is never used to recalculate or verify points.
- (Continues the invariant in CLAUDE.md.) It writes no reward
  group: a TidyHQ smart group tracks members reaching reward levels, and the
  Board owns it. Points corrections and every other change to member
  data happen in TidyHQ, by people SML appoints. Admin points adjustments are
  dropped, not deferred: TidyHQ already has the permissions, history and audit
  a correction needs.
- On a new check-in (member not already in the event's group), add the
  member to the group first, then add `POINTS_PER_CHECKIN` to
  the stored total. If they're already in the group, award nothing and change
  nothing. One check-in per member per event.
- (Continues the invariant in CLAUDE.md.) The member then sees "You're checked in, but we
  couldn't confirm your point": the check-in is saved, but the write may have
  landed, so a Board member checks the total in TidyHQ before adding anything.
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
  A member already in its group still sees their check-in. An event with no
  attendance group is refused the same way (`event_unavailable`; there is no
  group to read, so nothing is checked first). Only an event TidyHQ doesn't
  have (`findEvent` returns null on a 404) says "We couldn't find that event".
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
  check-in (except when the time budget ran out, below). A self check-in's
  time isn't recorded (TidyHQ's API documents no
  timestamp for group membership); that gap is accepted. A failed note is
  logged and never fails the check-in or touches points.
- `acceptsCheckIn(event)` (`src/lib/tidyhq/acceptsCheckIn.ts`) is the one rule
  for whether an event takes check-ins at all (true for every event today,
  shared ones included). It sits in `checkinBlocker` next to archived, as the
  reason `not_accepted`, so the admin event page's QR code, the volunteer page
  and check-in (`event_unavailable`) all refuse together. If the Board later
  wants partner events recorded without points, that is a separate rule added
  then.
