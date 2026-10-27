---
paths:
  - "src/app/**"
  - "src/lib/admin/**"
  - "src/lib/checkin/**"
  - "src/lib/member/**"
  - "src/lib/tidyhq/contactName*"
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
- **Colors come from tokens** (`bg-accent text-on-accent`, `bg-surface`,
  `border-border`, plus background and foreground), never fixed colors, so
  light, dark and print follow `globals.css`.
