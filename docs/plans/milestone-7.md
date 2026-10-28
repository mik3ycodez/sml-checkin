# Milestone 7: Look like SML's TidyHQ site (0.7.0)

**Status:** ✅ Done, released as 0.7.0. PR 1 (0.6.2, branch
`m7-pr1-brand-header`, #52) ✅ Merged, PR 2 (#53) ✅ Merged, PR 3 (branch
`m7-pr3-profile-menu`, #54) ✅ Merged, PR 4 (branch `m7-pr4-theme-toggle`,
#55) ✅ Merged. Approved 2026-10-26 with changes (folded in below). The
0.7.1 patch (branch `patch/0.7.1-menu-icon`, #56) ✅ Merged and the 0.7.2
patch (branch `patch/0.7.2-keep-profile`) 🔍 In review (#58) come after the
milestone and are separate from it.

## Context

Members go between SML's TidyHQ site and this app (renewals and payments link
out to TidyHQ), so the app should look like the same organization: a white
header bar with the SML logo and "Seattle Men in Leather", a signed-in chip
with a menu on the right, and SML's TidyHQ accent `#636363` for buttons and
links. We don't copy TidyHQ's top nav. Dark mode stays and keeps following the
device by default, with a manual System / Light / Dark choice added at the
end.

Nothing here changes check-in, points or what the app writes to TidyHQ. The
session cookie does change (PR 3), so that section gets the most detail.

## Findings

### The brand files

`public/brand/` holds 10 files (re-listed after approval; the folder changed
since the first draft). Six are logos, four are icons:

| Current name                        | Size        | Alpha | Origin                             |
| ----------------------------------- | ----------- | ----- | ---------------------------------- |
| `Black-Tansparent.png`              | 1100 × 525  | yes   | Official                           |
| `White-Tansparent.png`              | 1100 × 525  | yes   | Official                           |
| `Black-Tansparent-square.png`       | 1100 × 1100 | yes   | Derived from the white square      |
| `White-Tansparent-square.png`       | 1100 × 1100 | yes   | Official                           |
| `Black-Tansparent-11x17-300dpi.png` | 5100 × 2459 | yes   | Official, print size (226 KB)      |
| `White-Tansparent-11x17-300dpi.png` | 5100 × 2459 | yes   | Official, print size (206 KB)      |
| `sml-icon-512.png`                  | 512 × 512   | no    | Derived from the black print logo  |
| `sml-icon-192.png`                  | 192 × 192   | no    | Derived from the black print logo  |
| `sml-icon-maskable-512.png`         | 512 × 512   | no    | Derived, padded for Android's mask |
| `apple-touch-icon.png`              | 180 × 180   | no    | Derived from the black print logo  |

**The derived files** were made from official ones with no redrawing. The
black square is the white square with its color set to black. The icons are
the figure (no wordmark) cropped from the black print logo onto white; the
maskable one has extra padding so Android's circle or rounded-square mask
doesn't clip it. The icons are opaque RGB, which is what home-screen icons
want. `Black-Tansparent-small.png` (opaque, not transparent) was removed.

- The header uses the 1100 × 525 pair. At a 40 px tall header logo that's
  about 84 px wide; 1100 px is about 4× what a 3× phone screen needs. Each is
  about 35 KB. **Decision:** use the originals only; no resized copies.
- **The squares don't help the header.** They're the full wide logo centered
  on a square canvas, so at the same height the artwork is about half the
  size of the wide logo's. They're locked and kept for later use (social
  cards, a future large splash), not used in 0.7.0.
- The logo already contains the words "Seattle Men in Leather" in small type,
  so the header text next to it repeats them. That matches the TidyHQ
  reference; on narrow phones the text is what gets dropped (see Header).
- "Tansparent" is a typo in the source names, one more reason to rename.

### The standalone build doesn't ship `public/`

`npm run build:standalone` copies `.next/static` into `.next/standalone` but
not `public/`. Next's standalone output leaves both out on purpose. Milestone
6 noted "there is no `public/` folder", which was true until now. Without a
fix, the logos work under `next dev` and **404 in e2e and on Azure**. The fix
is one more copy in the script (`cp -R public .next/standalone/`), a check in
`deploy.yml` that the zip contains `public/brand/`, and an e2e check that a
logo is served (PR 1).

### TidyHQ v2 contact spec: there is a profile image

I fetched `https://api.tidyhq.com/v2/openapi.json` (version 2.0) today. The
`Contact` schema has:

- **`profile_image`**: `{"type": "string", "format": "url"}`. No description,
  not in a `required` list (the schema has none), not marked `nullable`.
  The webhook docs mention that a change to `profile_image` fires a
  `contact.updated`. Nothing says where the image is hosted, whether the URL
  expires, or what a contact with no photo returns (absent, `null`, `""`, or a
  default placeholder image URL).
- **`initials`**: `{"type": "string"}`. TidyHQ computes initials for us. Same
  unknowns about blank values.

`GET /v2/contacts/me` returns a `Contact`, so the callback's existing
`getMe()` call already brings both back. No new endpoint.

What we don't know until live access, and how the plan copes:

- **Missing or blank:** treat anything that isn't a non-empty `https:` URL as
  "no photo" and fall back to initials. A new `LIVE-UNKNOWN(profile-image)`
  marker goes in the go-live checklist, as milestone 5 did for the other
  unknowns.
- **A default placeholder URL** (some systems return a gray silhouette instead
  of nothing): we'd show it. Harmless, just less nice than initials. Checked
  at go-live.
- **Expiring (signed) URLs:** we'd keep a dead URL until the next sign-in. The
  fallback below makes that degrade to initials, not a broken image.
- **`initials`:** used if it's 1 to 3 letters; otherwise we compute them from
  `contactName()` (first letter of the first and last words). The mock seed
  doesn't have the field, so the computed path is the one e2e covers.

### Contrast

WCAG AA needs 4.5:1 for normal text and 3:1 for UI parts (button edges,
focus rings). Computed with the WCAG relative-luminance formula:

| Pair                                                                            | Ratio    | AA text  |
| ------------------------------------------------------------------------------- | -------- | -------- |
| `#636363` on white (links, outline buttons)                                     | 6.01 : 1 | pass     |
| White on `#636363` (filled button)                                              | 6.01 : 1 | pass     |
| `#636363` on `#f5f5f5` (light card)                                             | 5.51 : 1 | pass     |
| `#636363` on `#171717` (if left in dark)                                        | 2.98 : 1 | **fail** |
| **`#a3a3a3` on `#0a0a0a`** (dark page)                                          | 7.85 : 1 | pass     |
| **`#a3a3a3` on `#171717`** (dark card/header)                                   | 7.11 : 1 | pass     |
| `#0a0a0a` on `#a3a3a3` (dark filled button)                                     | 7.85 : 1 | pass     |
| `#8a8a8a` on `#171717` (rejected: too close to the 4.5 line on `#262626`, 4.38) | 5.19 : 1 | pass     |

**Proposal: dark accent `#a3a3a3`.** It clears AA with room on every dark
surface we use, including a `#262626` hover (6.0:1), and stays a neutral gray
like `#636363`. Filled buttons in dark use dark text on it.

One more rule follows from a gray accent: `#636363` links against `#171717`
body text differ by only 2.98:1, below the 3:1 WCAG asks for when color alone
marks a link. **Links stay underlined**, as they are today.

## Design

### File names and the lock

Renaming only (`mv`; the files are untracked, so there's no history to keep).
Lowercase, hyphenated, say color and use. The four icons already have
web-friendly names and keep them.

| New name                    | From                                |
| --------------------------- | ----------------------------------- |
| `sml-logo-black.png`        | `Black-Tansparent.png`              |
| `sml-logo-white.png`        | `White-Tansparent.png`              |
| `sml-logo-black-square.png` | `Black-Tansparent-square.png`       |
| `sml-logo-white-square.png` | `White-Tansparent-square.png`       |
| `sml-logo-black-print.png`  | `Black-Tansparent-11x17-300dpi.png` |
| `sml-logo-white-print.png`  | `White-Tansparent-11x17-300dpi.png` |
| `sml-icon-512.png`          | (unchanged)                         |
| `sml-icon-192.png`          | (unchanged)                         |
| `sml-icon-maskable-512.png` | (unchanged)                         |
| `apple-touch-icon.png`      | (unchanged)                         |

Locked three ways, covering all 10 files:

1. **CLAUDE.md invariant:** the 10 files in `public/brand/` (SML's official
   logos and icons derived from them without redrawing) are never edited,
   resized, recompressed, re-exported or replaced, and nothing is added to or
   removed from the folder. No resized copies anywhere. `src/brand.test.ts`
   checks every file's SHA-256.
2. **`.claude/settings.json`** (new; checked in, so it applies to anyone
   using Claude Code on the repo):

   ```json
   {
     "permissions": {
       "deny": ["Edit(/public/brand/**)", "Write(/public/brand/**)"]
     }
   }
   ```

   A leading `/` means relative to the project root in permission rules.
   **Limit:** this blocks Claude's Edit and Write tools, not shell commands
   (`mv`, `cp`, an image tool). The test is what catches those.

3. **`src/brand.test.ts`:** a fixed map of file name to SHA-256 (the hashes
   below, which rename doesn't change). It fails if any hash differs, if a
   file is missing, or if the folder has any file not in the map. The failure
   message points at the CLAUDE.md invariant.

   ```
   4a5cc60e1083d22309357e0f4a215bd41e2937e00dbea1401e0ce20bb0c67f2a  sml-logo-black.png
   765a782c15ec92627eda0b29414ea61bb04162784478afb276c222d2562f10af  sml-logo-white.png
   9b47521f3a9fed686f9b3625ce9fa2b6de498fcc3b2c75f91725e1edaed35e2d  sml-logo-black-square.png
   eea8d55706531e80ccc1604e154adfd9df713e20830c7dac3b22e610fb3b0b46  sml-logo-white-square.png
   fd7c0fdcc481cccd4d3b2db53df4ba7ab1c0b25fbfeeabeb2ed3f9a8ca4a0a89  sml-logo-black-print.png
   f33bbdf0701c903f8982afc942d1b45703eda6e2e84cbdc442ad71ce1438bae4  sml-logo-white-print.png
   9578fcd828100e61e63f2f6a9aff1be5acf3a2a6153650be43f00de5ae455fcf  sml-icon-512.png
   27f991b0add9c9b3d6cd6e5cf8fb5fee3198c3cf3e44259f9a18e1c1542b52b2  sml-icon-192.png
   da162819467b03bbda936364e87786f6dd66e63b134a85ce84dc15289fa4f42a  sml-icon-maskable-512.png
   cf184eb63811e7e7e4e30bbbae1a3ae6be8244280551e2debac99c03610463f8  apple-touch-icon.png
   ```

### Favicon, home-screen icon and web manifest (PR 1)

- **Delete `src/app/favicon.ico`** (Next's default triangle).
- **Icons through `metadata.icons`** in `layout.tsx`, pointing at the files in
  `/brand/`: `icon` → `sml-icon-192.png` and `sml-icon-512.png`, `apple` →
  `apple-touch-icon.png`. Why not Next's file convention (`src/app/icon.png`,
  `src/app/apple-icon.png`): that needs a second copy of each icon inside
  `src/app`, outside the lock.
- **`src/app/manifest.ts`** (Next's metadata route, served at
  `/manifest.webmanifest` and linked automatically): name "SML Check-in",
  short name "SML", `start_url: "/"`, white background and theme color, and
  the three icons: 192, 512 (`purpose: "any"`) and the maskable 512
  (`purpose: "maskable"`).
- **`display: "browser"`, not `standalone`.** A home-screen app opened
  standalone on iOS gets its own cookie jar, separate from Safari, and an
  OAuth redirect out to TidyHQ can bounce into Safari and land the session
  in the wrong one. `browser` means "Add to Home Screen" gives SML's icon and
  name but opens in the normal browser, where sign-in already works.
- Browsers that ask for `/favicon.ico` without reading the page (some
  bookmark tools) are served the 192 icon by a rewrite in `next.config.ts`,
  which keeps it static and adds no copy outside the lock.
- The manifest has no `theme_color` yet; PR 2 adds light and dark theme colors.

Also `.gitattributes`: `public/brand/** binary`, so git never converts line
endings or diffs them as text, whatever a contributor's settings.

### Theme colors and the logo swap

Tokens in `globals.css`, exposed through `@theme inline` as today:

| Token          | Light     | Dark                            |
| -------------- | --------- | ------------------------------- |
| `--background` | `#ffffff` | `#0a0a0a`                       |
| `--foreground` | `#171717` | `#ededed`                       |
| `--accent`     | `#636363` | `#a3a3a3`                       |
| `--on-accent`  | `#ffffff` | `#0a0a0a`                       |
| `--surface`    | `#ffffff` | `#171717` (header, cards, menu) |
| `--border`     | `#e5e5e5` | `#2e2e2e` (thin dividers)       |

**Written for the toggle from the start.** Dark applies when either the
device says dark and the page hasn't been forced light, or the page is forced
dark:

```css
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    /* dark tokens */
  }
}
:root[data-theme="dark"] {
  /* dark tokens */
}
```

Before PR 4 nothing set `data-theme`, so only the first block applied. PR 4
just adds the attribute (from the `sml_theme` cookie). No CSS rework.

**Logo swap uses the same selectors, not `<picture>`:** the header renders
both images, and CSS shows one:

```css
.logo-for-dark {
  display: none;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .logo-for-light {
    display: none;
  }
  :root:not([data-theme="light"]) .logo-for-dark {
    display: inline;
  }
}
:root[data-theme="dark"] .logo-for-light {
  display: none;
}
:root[data-theme="dark"] .logo-for-dark {
  display: inline;
}
```

Why: `<picture><source media="(prefers-color-scheme: dark)">` only knows the
device setting and would ignore a manual choice. With CSS, one attribute on
`<html>` drives colors and logos together. A `display: none` image is left out
of the accessibility tree, so screen readers hear one "Seattle Men in
Leather" logo, not two. The cost: browsers usually fetch both images (about
67 KB the first time, then cached). Accepted: originals only.

**Print** stays forced light. The print block's selector is `:root:root`
(specificity 0,2,0, like both dark selectors, and later in the file), so it
beats the dark theme whether or not `data-theme` is set. The first draft's
`:root, :root[data-theme]` lost to `:root:not([data-theme="light"])` when no
attribute was set; the dark-print e2e test caught it.
`printStyles.test.ts` grows to check the new tokens.

Plain `display` and attribute selectors work on every browser we care about,
so older phones get the full theme. Nothing here needs newer CSS.

### Header (every page)

A server component, `SiteHeader`, rendered in `src/app/layout.tsx` right after
the demo banner, so it's on every page: member, admin, `/demo`, the mock
sign-in page, error and not-found pages. Inside the layout's full width, not
the `max-w-lg` main column, matching TidyHQ's full-width bar; its contents
line up with the main column.

- **Left:** the logo (40 px tall) and "Seattle Men in Leather", both one link
  to `/`. The text stays visible down to 360 px wide and hides only below
  that (`max-[359px]:sr-only`), where the logo carries the name. It can stay
  that long because below 640 px the chip is just the avatar and a chevron
  (see Profile chip and menu).
- **Right:** the profile chip (PR 3).
- **Look:** `--surface` background, a 1 px `--border` bottom edge, no shadow.
- **Element:** a `<header>` (a landmark, and it keeps the demo banner the
  layout's only `body > div`, which `demo.spec.ts` relies on).
- **Print:** the whole header is `print:hidden`, like every other control on
  the admin QR sheet. The sheet gets its own logo instead (next item), so
  print never depends on which theme logo is showing.

**Admin printed QR sheet (PR 2):** the black logo (`sml-logo-black.png`) at
the top of the event page, shown only when printing (`hidden print:block`).
Paper is white whatever the theme, so it's always the black one.

### Profile chip and menu (PR 3)

A native `<details>`/`<summary>` disclosure. It opens and closes with no
JavaScript, on every browser back to well before iOS 16.4.

- **Summary (the chip):** a rounded-square avatar (photo, or initials on an
  accent background) and a chevron (inline SVG). From 640 px wide the
  member's name also shows beside the avatar (cut off with an ellipsis past
  about 12 characters); below that the chip is only the avatar and chevron.
  It's always labelled "Account menu, signed in as <name>".
- **Panel:** absolutely positioned under the chip, right-aligned and never
  wider than the screen minus its margins, `--surface`, rounded, a
  soft shadow, `--border` dividers, gray outline icons (inline SVGs, no icon
  library: three icons don't justify a dependency). Like TidyHQ's menu, which
  shows the email at the top, it starts with the member's name. Items:
  1. **My points and status**, a link to `/me`.
  2. **Theme** (PR 4).
  3. **Sign out**, still `POST /auth/signout`, with a `returnTo`.
- **Signed out:** a small "Menu" disclosure in the same style, with "Sign in"
  (a link to `/me`, which already sends visitors through sign-in and back)
  and, from PR 4, the theme row.
- **What closes it:** tapping the chip again, or following a menu item.
  Tapping outside doesn't close it. No script: the app stays script-free.
- **Admin event page:** its meta refresh reloads the page, which closes an
  open menu every refresh (30 s at events, 2 s in e2e). Acceptable for a
  menu used rarely.

**Where `returnTo` comes from.** Today each page passes its own path to
`SignedInAs`. The header lives in the layout, and a Next layout isn't told
the current path. A new `src/proxy.ts` (Next 16's name for middleware) copies
the request's path and query into a request header, `x-sml-path`, that the
layout reads with `headers()`. It's passed through the existing
`safeReturnTo` on use, and set only with `NextResponse.next({ request })`,
which forwards it to the server only, never to the browser. The matcher skips
`/_next/`, `/brand/` and any path with a file extension (so no page route may
contain a dot). **The proxy only passes the path along.** It never
redirects, reads the session or checks access; every auth check stays where
it is now, in the pages and actions (a test asserts it only ever returns
`NextResponse.next`). This keeps today's behavior that matters at the door:
signing out on an event's check-in page goes straight back to that check-in
page, so the next member on a shared phone signs in. The rule is general:
any check-in screen (`/checkin/<id>/...`, the staff check-in page, and the
denied page for it) signs out to `/checkin/<id>`; every other page returns to
itself. The header logo is a plain `<a>`, since a client-side navigation
doesn't re-render the layout and `returnTo` would go stale. (Reading the `Referer`
header in the sign-out route would also work, but depends on the browser's
referrer policy; the proxy is ours to test.)

**This removes `SignedInAs`, `MemberFooter`'s sign-out line, and the five
"Signed in as" lines** on the admin, event, staff check-in, `/me` and
check-in screens. "My points and status" and "Are you a volunteer?" stay as
on-page links: the app-pages rule requires `/me` to be linked from the
check-in screens, and the menu alone wouldn't satisfy it for members who
don't open it.

**Dead-end check:** "Not you?" used to be printed on the page; now the name is
always visible in the header, and Sign out is one tap into the menu. That's
the shared-phone case covered.

**Volunteer privacy:** the chip shows the signed-in person's own name and
photo only, never anything about other members. The staff check-in page shows
the volunteer's own chip. No change to what volunteers see about others.

### How the header gets the name and photo (the session cookie)

**The problem:** the layout renders on every page, and pages like `/`,
`/demo`, the mock sign-in page and not-found don't otherwise read TidyHQ. A
`getContact` call in the layout would add a TidyHQ call (and its latency and
failure modes) to every one of them, plus pages that do read the contact
can't hand it to the layout, since a layout and its page render side by side.

**The plan:** read the name and photo once, at sign-in, and keep them in the
signed session cookie. The callback already calls `getMe()` and gets the full
contact back; today it keeps only `id`. The session becomes:

```ts
type Session = {
  contactId: string;
  exp: number;
  /** For the header only. Never used to decide anything. */
  name?: string; // contactName(contact), capped at 100 chars
  initials?: string; // 1–3 letters
  photo?: string; // only an https URL under 512 chars; else no photo
};
```

What that means:

- **No extra TidyHQ calls.** The header reads the cookie, which `getSession`
  already verifies once per request.
- **Bigger cookie:** from about 120 bytes to about 300–900, depending on the
  photo URL. A photo URL that isn't `https:` or is 512 characters or longer
  is treated as no photo (initials), never truncated, so the cookie can't
  grow past the 4 KB limit however long TidyHQ's URLs are.
- **Signed, not encrypted.** The HMAC stops anyone forging a name, but the
  contents are readable base64 to anyone who can read the cookie. It's
  httpOnly (page scripts can't read it) and on the member's own phone, and it
  holds only their own name and photo link, which they can already see in
  TidyHQ. Acceptable; no email, membership or points go in it. (Encrypting it
  would need a second key and more code for little gain; I'd not do it.)
- **Can go stale:** a name or photo changed in TidyHQ shows after the next
  sign-in or check-in, whichever comes first (0.7.2 refreshes it at every
  check-in, from the contact the check-in already reads, so no extra TidyHQ
  call). A member who neither signs in nor checks in keeps the old one until
  their session ends, up to 90 days. Fine for a header.
- **Display only.** Every decision (membership, admin, volunteer) and every
  written name (the staff note) still comes from a fresh TidyHQ read, never
  the cookie. A comment on the type and a test say so.
- **Existing sessions keep working.** The three fields are optional, so
  `verifySession` accepts old cookies; the header shows a generic person icon
  and "Signed in" until the member next signs in. Nobody is signed out by the
  deploy.
- **Fails soft.** If the cookie can't be read for any reason (including a
  missing `SESSION_SECRET` on a misconfigured dev server, where
  `getSessionSecret` throws), the header renders as signed out rather than
  breaking every page. The startup check still refuses a bad secret in
  production.
- **Mock:** the mock's `getMe` returns the seed contact. Marcus gets a photo:
  a plain generated SVG avatar under `public/mock/` (clearly not SML's, and
  outside the locked folder), so both the photo and initials paths run in
  e2e. Because that file is served from this site over http in e2e, the
  https-only photo rule also accepts a root-relative `/mock/<file>` path,
  only when `TIDYHQ_MODE=mock`. Added in PR 3.

**The photo itself** is a plain `<img>`, not `next/image` (which would proxy
TidyHQ's images through our server and need its host listed, which we don't
know yet). `referrerPolicy="no-referrer"` so TidyHQ's image host doesn't
learn which of our pages the member is on, `alt=""` because the name is right
beside it, and it sits on top of the initials square. If the URL is dead or
blocked, Safari and Chrome draw nothing for a broken image with empty alt, so
the initials underneath show through. That works without JavaScript, so no
`onerror` handler.

### Theme toggle (PR 4)

- **Cookie** `sml_theme`: `system` | `light` | `dark`, one year, `path=/`,
  the shared `secureCookieOptions()` (httpOnly is fine: only the server reads
  it). Anything else counts as `system`.
- **Applied server-side:** the layout reads it and sets
  `<html data-theme="light|dark">` (no attribute for `system`). Since the
  server sends the right attribute in the first byte of HTML, there's **no
  flash**, and no inline script, so it works without JavaScript. The
  `color-scheme` property follows too, so form controls and scrollbars match.
- **Setting it:** in the menu, a "Theme" row with three buttons (System,
  Light, Dark) in one `<form method="post" action="/theme">`, the current one
  marked `aria-pressed`. A new route handler checks the value and same-site
  origin (like sign-out), sets the cookie, and redirects 303 back to
  `returnTo`. Plain form post, so no JavaScript needed.
- **Signed out:** the theme row is in the signed-out "Menu" too, so it's
  reachable without signing in.
- **Print** still forces light, whatever the cookie says.

### Restyle

- `PRIMARY` (in `memberUi.tsx`): accent background, `--on-accent` text,
  rounded-lg, same size. The **Check in** button stays the first control in
  `<main>` on the check-in screen and full width; an e2e check confirms it's
  in the first viewport on the iPhone 15 project.
- `SECONDARY`: accent outline and accent text.
- Cards (`TidyHqNotice`, rewards, the admin attendee box): `--surface` with a
  `--border` outline and rounded-xl, matching the menu.
- Lists (recent events, admin event list, attendees): thin `--border`
  dividers between rows instead of separate boxes.
- Links: accent color, underlined. Focus rings: 2 px accent outline (3:1 or
  better on every surface above).

## PRs (in order)

Four PRs (approved). The brand files and their lock go in first, on their
own: that PR is small, it fixes the standalone `public/` copy before anything
depends on it, and every later PR is then protected by the hash test.
Colors, header and restyle go together, since they're one visual change.

### PR 1: Brand files, the lock, icons and shipping `public/` (0.6.2)

Branch `m7-pr1-brand-header`. Test first: `src/brand.test.ts` (fails until
the files are renamed), a manifest test, a layout metadata test (icons point
at `/brand/`), and `e2e/staticFiles.spec.ts` checks that a logo, an icon and
the manifest are served (fails until the build copies `public/`).

- Rename the six logos; commit all 10 files.
- `src/brand.test.ts`, `.claude/settings.json` deny rule, `.gitattributes`,
  CLAUDE.md invariant.
- Favicon, apple-touch-icon and `src/app/manifest.ts`; delete
  `src/app/favicon.ico`.
- `build:standalone` copies `public/`; `deploy.yml` checks the zip has
  `public/brand/`; `scripts/check-deploy.mjs` also fetches one logo.
- Docs: milestone 6's "no `public/` folder" line and the `azure-demo.md`
  rule's deploy check get updated.
- No page shows the logos yet. A patch bump, since it changes the build and
  the icons.

### PR 2: Theme colors, header, restyle, and the logo on the QR sheet

Test first: `layout.test.ts` (header on every page, banner before header,
both logos with the right classes, header renders signed out when the session
can't be read), `printStyles.test.ts` (new tokens, beats `data-theme`), a CSS
test that each `data-theme` selector exists for the logo swap, an event page
test for the print-only black logo.

- Layout: `body` is a `min-h-dvh` flex column and `main` is `flex-1`, so the
  banner, header and page fill exactly one screen and centered screens center
  below the header. `viewport.themeColor` has light `#ffffff` and dark
  `#171717` entries (the dark `--surface`, matching the header; the manifest keeps no `theme_color`: it holds only one).
- Tokens, logo swap CSS, `SiteHeader` (logo and text only), restyle of
  `PRIMARY`, `SECONDARY`, cards, lists, links, the black logo on the printed
  QR sheet.

### PR 3: Profile chip, menu and photo

Test first: session tests (new fields round-trip, old cookies still verify,
caps and the https-only photo rule), callback test (fields saved from
`getMe`), initials tests, chip and menu render tests (initials fallback, photo
markup with `no-referrer`, signed-out state), proxy test (`x-sml-path` set and
not sent to the browser), the contract suite gains `profile_image` and
`initials` on `getMe`.

- `Session` fields, callback, `src/proxy.ts`, `ProfileMenu`, removal of
  `SignedInAs` and the "Signed in as" lines, mock seed photo,
  `LIVE-UNKNOWN(profile-image)` and the go-live checklist item.

### PR 4: Theme toggle and 0.7.0 (#55)

Built as planned. Two details worth knowing: `viewport` became an async
`generateViewport` (it has to read the cookie per request), and the header
passes the menu both `returnTo` (Sign out's rule) and `pagePath` (the exact
page, for the theme switch).

Test first: theme cookie parsing, the `/theme` route (valid values, bad value
ignored, cross-site post refused, 303 to `returnTo`), layout sets
`data-theme` from the cookie, new `e2e/theme.spec.ts`.

- **Theme-color follows the forced theme.** The `theme-color` metas only check
  `prefers-color-scheme`, so a forced theme would leave the browser bar
  showing the other one. When the cookie forces light or dark, the layout
  must emit a single `theme-color` (no `media`) from the server, using that
  theme's surface color.
- Cookie, route, menu row, signed-out menu, `package.json` 0.7.0, CLAUDE.md
  and `app-pages.md` updates, this plan marked done.

### Patch 0.7.1: size the signed-out menu's person icon (#56)

Branch `patch/0.7.1-menu-icon`. ✅ Merged. A bug fix after 0.7.0: the
signed-out menu's "Sign in" icon had no size, so it grew to fill the panel and
pushed the "Sign in" text out of view.

- `PersonIcon` now builds on the shared `ICON` defaults (20px) and takes any svg
  prop, so the signed-out row is `<PersonIcon />` and the avatar overrides the
  size and color.
- Test first: a unit test that every svg in the menu has a size (classes count
  only as whole `size-N` or `w-N` plus `h-N` tokens), and a check folded into
  the existing signed-out e2e test that the icon's own box is 24px or less.
- No behavior or rules change, so no CLAUDE.md or rules update.

### Patch 0.7.2: keep the profile when a check-in renews the session (#58)

Branch `patch/0.7.2-keep-profile`. 🔍 In review (#58). A bug fix after 0.7.1:
the sliding-expiry refresh after a successful check-in called `setSession`
without the profile, so the session lost the member's name, initials and photo
and the header fell back to the person icon until they signed in again.

- `checkIn` and `assessCheckIn` now return `profile: profileFor(contact)` for
  the contact they already read (no extra TidyHQ call), and `checkInAction`
  renews the session with it. So the header profile refreshes at sign-in and at
  every check-in, and a pre-0.7.0 session with no profile gets one at its next
  check-in. Only the `point_not_saved` path has no fresh contact; it keeps the
  session's own profile.
- `setSession`'s `profile` is now required (no `{}` default), so a caller that
  forgets it fails to compile.
- Test first: a renewal writes the fresh name and photo, a session with no
  profile gets one, a repeat tap refreshes it, and `point_not_saved` keeps the
  session's; plus a check folded into the existing check-in e2e test that the
  header chip still shows the member's initials after checking in.
- Docs: the "Can go stale" note above, the comment in `session.ts` and
  `.claude/rules/app-pages.md` now say the profile refreshes at sign-in and at
  every check-in.

## E2E specs that change

| Spec                   | PR   | Why                                                                                                                                                                                                                                                               |
| ---------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `staticFiles.spec.ts`  | 1    | New: a logo, an icon and the manifest are served (chromium only, like the CSS check).                                                                                                                                                                             |
| `demo.spec.ts`         | 2    | Header present on `/`, `/demo`, `/no-such-page` and the mock sign-in page, below the banner. The `body > div` banner locator stays valid because the header is a `<header>`.                                                                                      |
| `checkin.spec.ts`      | 2    | New check: Check in is in the first viewport on the phone projects.                                                                                                                                                                                               |
| `admin.spec.ts`        | 2, 3 | Print test: the sheet's black logo shows and the header is hidden. Line 14's "Signed in as Casey Moreno" becomes a check on the header chip.                                                                                                                      |
| `auth.spec.ts`         | 3    | Sign out is inside the menu: open the chip first. The mock sign-in page has buttons named after members ("Dante Ruiz"); its locators get scoped to `main` so a header chip with the same name can't collide.                                                      |
| `me.spec.ts`           | 3    | Sign out via the menu; a new check that "My points and status" in the menu reaches `/me`.                                                                                                                                                                         |
| `staffCheckin.spec.ts` | 3    | Sign out via the menu.                                                                                                                                                                                                                                            |
| `theme.spec.ts`        | 4    | New, lean: pick Dark on `/me`, check `data-theme`, body color and the white logo; back to System follows `emulateMedia`. Runs in all three projects (it's a form, so `webkit-no-js` matters). Not on the admin event page, whose 2 s refresh would make it flaky. |

`inconsistentMembership.spec.ts` and `noGroupEvent.spec.ts` shouldn't need
changes; if their name locators collide with the chip, they get scoped to
`main` the same way.

Unit tests that change in PR 3 (named again in that PR's description): the
`SignedInAs` tests in `checkin/[eventId]/screens.test.ts` move to the new
`ProfileMenu` test, and the "Signed in as …" assertions in
`checkin/[eventId]/screens.test.ts`, `me/screens.test.ts`,
`admin/screens.test.ts` and `admin/events/[eventId]/eventScreens.test.ts` are
removed, because those lines leave the pages.

## Unchanged, and checked

- **Demo mode:** the banner stays first, server-rendered, above the header.
- **`/demo` walkthrough:** none of its scenarios quote "Signed in as" or "Sign
  out" text (checked); Start still posts to `/auth/signout` with its own
  `returnTo`.
- **Older phones:** everything is plain HTML forms, `<details>` and simple CSS;
  nothing requires JavaScript or newer CSS features.
- **No `<Suspense>`, no `loading.tsx`.**
- **TidyHQ writes:** none added or changed.

## Decisions (settled at approval, 2026-10-26)

1. **Four PRs**, PR 1 as patch 0.6.2 on `m7-pr1-brand-header`.
2. **Originals only.** No resized copies of any brand file.
3. **Mock photo:** a generated SVG avatar under `public/mock/` for Marcus.
4. **No refresh at check-in.** Name and photo update at the next sign-in.
5. **Script-free menu.** No outside-tap or Escape handling.
6. **Signed-out header:** a small "Menu" with "Sign in" and the theme row.
7. **Black square:** now exists (derived from the white square, color only).
   Locked with the rest, but not used in the header, because it's the wide
   logo on a square canvas and so smaller at header height (see The brand
   files).
8. **Narrow phones:** below 640 px the chip shows only the avatar and chevron,
   and the member's name moves to the top of the open menu (the chip's
   accessible label still has it). That frees room, so "Seattle Men in
   Leather" stays visible down to 360 px and hides only below that.
   (Changed in PR 3; it was "hides below about 400 px".)
9. **Photo in the cookie:** only an `https:` URL under 512 characters;
   anything else is no photo. Rendered with `referrerPolicy="no-referrer"`.
10. **`proxy.ts` only passes the path along.** Auth checks stay in the pages
    and actions.
11. **PR 1 adds** the SML favicon, apple-touch-icon and web manifest; **PR 2
    adds** the black logo at the top of the printed QR sheet.
