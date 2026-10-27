---
paths:
  - "src/app/**"
  - "src/lib/admin/**"
  - "src/lib/checkin/**"
  - "src/lib/member/**"
  - "src/lib/tidyhq/contactName*"
  - "src/proxy*"
  - "next.config.ts"
  - "playwright.config.ts"
  - "e2e/**"
---

# App pages rules

- **`/me` is reachable from the home page and the member check-in screens via
  "My points and status".** Don't remove those links (`MyPointsLink`,
  `MemberFooter`, the home page); tests check them.
- **A member's name is always `contactName(contact)`** (`src/lib/tidyhq`):
  display name, else first and last name, else "Unnamed member". Never read
  `display_name` directly: live data may have nulls.
- **No Cache Components** (`cacheComponents` is off in `next.config.ts`).
  Every page here is dynamic (cookies, TidyHQ reads), so it gives us nothing,
  and it forces `<Suspense>` around request-time data. Streamed `<Suspense>`
  content is revealed by a script, so with JavaScript off or failing (event
  Wi-Fi), members would see "Loading…" forever. Don't wrap member pages in
  `<Suspense>` or add `loading.tsx` files under `src/app`:
  `src/app/noSuspense.test.ts` fails if either appears, and the Playwright
  `webkit-no-js` project (JavaScript off) runs every spec to catch the rest.
  Revisit at the next major Next.js version, where Cache Components becomes
  the default.
- **Layout height:** `body` is a `min-h-dvh` flex column and `<main>` is
  `flex-1`, so the demo banner, `SiteHeader` and page fill one screen. Screens
  that center content use `flex-1 justify-center` and center below the header.
  Don't put `min-h-dvh` back on `<main>`.
- **Who's signed in, and Sign out, live in the header's `ProfileMenu`**, not on
  pages (no "Signed in as" lines). Its name, initials and photo come from the
  signed session cookie, written at sign-in, for display only; every decision
  and every written name still comes from a fresh TidyHQ read. `src/proxy.ts`
  only copies the path into `x-sml-path` (for Sign out's `returnTo`); it never
  redirects or checks access, and skips files with an extension, so no page
  route may contain a dot. Sign out returns to the current page, except that
  any check-in screen (`/checkin/<id>/...`, staff check-in, and the denied page
  for it) returns to that event's member check-in. The header logo is a plain
  `<a>`, never `next/link`: the layout isn't re-rendered by client-side
  navigation, so the page Sign out returns to would go stale. Photos are
  `https:` URLs under 512 characters (else initials); `/mock/<file>` avatars
  are accepted only when `TIDYHQ_MODE=mock`. A contact with no usable name gets
  no name or initials, so the menu shows "Signed in". The menu is a
  script-free `<details>`.
- **Theme (System / Light / Dark) is the `sml_theme` cookie**, read only on the
  server: the layout sets `<html data-theme="light|dark">` (none for System, so
  it follows the device) and `generateViewport` gives the browser bar one
  `theme-color` with no `media` for a forced theme, else the light and dark
  pair. No script, so no flash and it works with JavaScript off. The menu's
  Theme row is a plain `POST /theme` form, in the signed-out "Menu" too. It
  returns to the exact current page (`pagePath`, through `safeReturnTo`), not
  Sign out's `returnTo`: nobody is changing members, so a check-in screen stays
  put. Anything but `system`, `light` or `dark` counts as System; print stays
  light. `THEME_BAR_COLORS` must equal the `--surface` shades in `globals.css`
  (`src/lib/theme.test.ts` checks).
- **Colors come from tokens** (`bg-accent text-on-accent`, `bg-surface`,
  `border-border`, plus background and foreground), never fixed colors, so
  light, dark and print follow `globals.css`.
