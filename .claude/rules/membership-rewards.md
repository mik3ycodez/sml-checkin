---
paths:
  - "src/lib/membership*"
  - "src/lib/rewards*"
  - "src/lib/points*"
  - "src/lib/dates*"
  - "src/lib/logInconsistentMemberships.ts"
  - "src/lib/member/**"
  - "src/lib/checkin/**"
  - "src/lib/tidyhq/customFields*"
  - "src/app/me/**"
  - "src/app/checkin/**"
  - "src/app/admin/events/**/checkin/**"
  - "e2e/me.spec.ts"
  - "e2e/inconsistentMembership.spec.ts"
---

# Membership, rewards and dates rules

- **Rewards (display-only).** Club colors at 18 points (`REWARDS` in
  `points.ts`). The Board hands them out and marks them issued in a TidyHQ
  custom field (`readRewardIssued`); this app only reads it. Issued wins over
  everything, even under 18 points. Unreadable points or issued field: say
  nothing about the reward rather than guess. **In live mode a missing
  colors-issued field is unreadable** (`LIVE-UNKNOWN(missing-issued-field)`,
  go-live item 2a), like points, so a token that can't see the field never
  tells everyone "You qualify"; mock mode treats missing as not issued. The
  app writes nothing about rewards (no group, no field): the Board's TidyHQ
  smart group lists who is owed colors.
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
- **Contact status is not a check-in gate.** Membership standing is the only
  one: an inactive (archived) contact with a counted membership can sign in,
  check in and earn points. That is a data issue for the Board to fix in
  TidyHQ, not something the app decides. Group lists include inactive contacts (`show_all=true`)
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
