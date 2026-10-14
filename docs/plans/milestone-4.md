# Milestone 4: Admin pages

**Status:** Not started. This plan collects items as they come up; it gets a
full PR breakdown when milestone 3 is done.

## Items

### Admin sign-in

**Why:** Every admin page needs to know who's allowed in (the SML Board and
the social coordinator). Nothing decides that yet.

**Open questions:** How are admins identified? A TidyHQ contact group, an
allowlist in config, or TidyHQ's own admin roles? Does admin sign-in reuse
the member TidyHQ OAuth flow?

### Event list with check-in QR codes

- Events pulled from TidyHQ (`listEvents`), with a QR code per event
  pointing to `APP_ORIGIN/checkin/<eventId>`.
- Until this exists, use any QR generator with that URL (see milestone 3).

### Live attendee list

- The event's attendance group, refreshed while the admin watches.

### Staff check-in by name search

- Same rules as self check-in (`assessCheckIn` / `checkIn`): one check-in
  per member per event, the same points.
- Records **method (`self` or `staff`) and time**. There's no role:
  volunteers are members flagged in TidyHQ, not a kind of check-in (removed
  in milestone 3 / PR 2).
- Where to record method and time is still to be decided. The likely
  answer is a TidyHQ contact note (`POST /v2/contacts/{id}/notes`), since
  the app has no database.

### Report: club colors owed

- Lists members who qualify for club colors (18+ points) but haven't been
  issued them. Uses the same `rewardStatus` and `readRewardIssued` as `/me`
  (milestone 3 / PR 8), so the report and the member page agree.
- Members whose points or issued field can't be read are listed separately
  as "needs checking", not left out.
- This is a supplemental cross-check. The Board's own auditing in TidyHQ
  remains the official record, and the app never marks colors as issued.

### Warnings for invalid check-in windows

- On admin event pages, flag a window that's half-filled, unparseable, or
  closes before it opens. Check-in currently ignores such a window silently
  and falls back to the event's start and end (see CLAUDE.md, "Out of
  scope for MVP").
