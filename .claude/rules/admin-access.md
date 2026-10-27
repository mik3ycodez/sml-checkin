---
paths:
  - "src/app/admin/**"
  - "src/lib/admin/**"
  - "src/lib/auth/**"
  - "src/app/requireVolunteer*"
  - "src/lib/checkin/staff*"
  - "e2e/admin.spec.ts"
  - "e2e/staffCheckin.spec.ts"
---

# Admin and volunteer access rules

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
