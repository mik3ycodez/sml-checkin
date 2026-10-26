# Milestone 6: Demo on Azure App Service

**Status:** In progress, PR 1 🔍 In review (#46). The 0.5.3 patch (Next.js security
fix) came first and is separate from this milestone: ✅ Merged (#45).
Milestone 6 is two PRs and
ends at 0.6.0.

## Context

The earlier plan to host the demo on Vercel is dropped. The demo runs on
**Azure App Service (Linux)**, the same host planned for production, so the
demo doubles as a production rehearsal. It uses `TIDYHQ_MODE=mock` and
`DEMO_MODE=on` on a personal Azure account; production later moves to an
SML-owned account.

## Decisions

- Start on the **F1 (free)** tier. Move to **B1** only if F1 gets in the way
  (the daily CPU quota, sleeping, or a custom domain).
- Node 24 runs on App Service's built-in Linux Node image. No container.
- Build in GitHub Actions, deploy a standalone build. App Service never builds.
- Deploy from GitHub Actions with OIDC federated credentials. No publish
  profile and no secrets in the repo.
- Exactly one instance (the mock keeps its state in memory).
- No health check endpoint for the demo. A check after each deploy makes a bad
  config visible instead.

## Findings

### Node 24

Available today. Microsoft's Node.js configuration page (updated 2026-10-19)
uses `NODE|24-lts` for Linux. Choose "Node 24 LTS" in the portal, or check
with `az webapp list-runtimes --os linux | grep NODE`. App Service sets the
major version and patches minor versions itself. Web App for Containers would
only matter if we needed an exact patch version.

### How it runs

- `output: "standalone"`, not `next start`. `next start` needs the whole
  `node_modules` uploaded; standalone builds a small `server.js` with only the
  files it uses. Smaller zip, faster deploys, fits F1's 1 GB storage.
- Standalone does not copy static files. After the build:
  `cp -r .next/static .next/standalone/.next/` (there is no `public/` folder).
  Without it, pages load without CSS.
- The deploy zip is built from **inside** `.next/standalone` (after the static
  copy), so `server.js` is at the zip root. Zipped from the repo root,
  `HOSTNAME=0.0.0.0 node server.js` in `/home/site/wwwroot` fails with
  "Cannot find module server.js". The check after deploy (see Startup
  checks) must catch this too.
- App Service sets `PORT`; `server.js` reads it. It also reads `HOSTNAME`,
  which some platforms set to the container's name, so the startup command is
  **`HOSTNAME=0.0.0.0 node server.js`**. Confirm on the first deploy.
- Build in GitHub Actions, not on App Service: building there installs
  devDependencies and uses F1's 60 CPU minutes a day. Set
  `SCM_DO_BUILD_DURING_DEPLOYMENT=false`.
- The e2e suite switches to running the standalone `server.js`, so it tests
  what ships.

### Deployment (OIDC)

- New `.github/workflows/deploy.yml`, triggered by `workflow_run` when CI
  completes, and only if CI succeeded on a push to `main`. Also
  `workflow_dispatch`. `ci.yml` stays as it is.
- The job uses `environment: demo` and `permissions: id-token: write`. It
  checks out the exact commit that passed CI, builds standalone, zips it, signs
  in with `azure/login@v2` (client, tenant and subscription ids) and deploys
  with `azure/webapps-deploy@v3`. Check for newer major versions when writing
  the PR.
- `workflow_run` only fires once `deploy.yml` is on `main`, so the first real
  deploy happens after the workflow PR merges.

### Startup checks

A bad config does **not** crash the server. Measured locally with the
standalone `server.js` (Next 16.4.3, macOS), the same as `next start`:

- `DEMO_MODE=bogus`: the log prints `✓ Ready`, then
  `Failed to prepare server … DEMO_MODE must be "on", "off" or unset.` The
  process does not exit and the port stays open. `/` and `/me` return **500**,
  and the reason repeats in the log on every request.
- `SESSION_SECRET` unset (with `DEMO_MODE=on`): the same, with
  `Cannot start in production: SESSION_SECRET is missing.` repeated on every
  request.
- The log names the setting and never its value (`bogus` never appears).

So expect no restart loop on App Service: the container looks "up" while
serving errors, and a deploy still reports success. **`✓ Ready` prints before
the failure**, so the log's "Ready" line can't be trusted either: only a
request tells.

The fix is a check at the end of the deploy workflow: fetch `DEMO_URL/` until
it returns 200 (allowing a cold start of up to about 5 minutes), and fetch one
`/_next/static` CSS file to catch a missing static copy. A zip built from the
wrong folder (no `server.js` at its root) never reaches 200, so the same
wait catches it. A failure turns the
run red.

App Service Health check is not used: on F1 and on a single instance it only
gives metrics, and never replaces or removes the instance. No `/api/health` is
needed for the demo; revisit for production on B1 or higher.

### One instance

- F1 has one shared instance and no scale-out, so it is pinned by the tier. On
  B1, set Scale out to Manual, 1.
- Never start PM2 in cluster mode (`-i`): each process would hold separate
  mock data.
- Checked in the code: the module-level state is the mock store
  (`src/lib/tidyhq/index.ts`, cached on `globalThis`), the bounded QR SVG
  cache (`src/lib/admin/qr.ts`, a `Map`) and the time budget's
  `AsyncLocalStorage` (`src/lib/tidyhq/budget.ts`, on `globalThis`). The
  cache is only a per-instance speedup and the budget is per-request state,
  so both are safe with several instances; only the mock store must not be
  split. Sessions are signed cookies and OAuth state is a cookie. Live mode
  is safe with several instances later.
- Every restart, deploy or F1 sleep resets the mock data. Members stay signed
  in (seed contact ids don't change). The portal's Restart button is a "reset
  demo" button.
- Never set `E2E` on the demo. It does two things: it turns on the public
  reset route (`/mock-tidyhq/reset`, no auth, so anyone could reset the
  demo), and it drops the admin attendee refresh from 30 s to 2 s
  (`src/lib/admin/attendees.ts`), so an open admin page renders 30 times a
  minute instead of 2 and burns F1's CPU quota.

### Tier and cost

|               | F1                                                                                            | B1                                             |
| ------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| CPU           | 60 min/day and 3 min per 5 min; over quota means 403 until midnight UTC (4 pm PST / 5 pm PDT) | Unlimited                                      |
| Always On     | No: the app sleeps when idle, then cold-starts and loses demo state                           | Yes                                            |
| Custom domain | None (azurewebsites.net only)                                                                 | Yes, with SNI TLS                              |
| Cost          | Free                                                                                          | About $13/month (check the pricing calculator) |

Server-rendered pages cost milliseconds of CPU, and the admin page's
30-second refresh is about 2 renders a minute, only near check-in time, so a
demo fits within F1. Production needs B1 or higher for a custom domain and
Always On, so the custom domain and certificate get rehearsed in SML's
account, not here.

Turn **HTTPS Only** on and set minimum TLS 1.2. The `*.azurewebsites.net`
certificate is free. Add a Cost Management budget alert (for example $5).

### Still applies from the earlier review

- Pin `engines.node` to `24.x` (it is `>=24` today). `.nvmrc` already says 24.
  A test keeps the two in step.
- Cookies: no change. `secure` follows `APP_ORIGIN`, not the request.
  Session affinity (ARRAffinity) can be turned off; it does nothing with one
  instance.
- Timezone: no change. The server runs in UTC and dates use an explicit
  `America/Los_Angeles` through `Intl`. Don't set `TZ`.
- Meta refresh and JavaScript off: host-independent, still work. The CSS check
  after deploy covers standalone's one real risk.
- `maxDuration = 30` is ignored by a self-hosted server. App Service's front
  end times out at 230 seconds, so the app's own 24-second budget is what
  limits a check-in. No change.

## App settings (demo)

Placeholders only; real values are set in the portal.

| Setting                          | Value                                                  | Secret? |
| -------------------------------- | ------------------------------------------------------ | ------- |
| `TIDYHQ_MODE`                    | `mock`                                                 | no      |
| `DEMO_MODE`                      | `on`                                                   | no      |
| `APP_ORIGIN`                     | `https://<default domain from the web app's Overview>` | no      |
| `SESSION_SECRET`                 | `<output of: openssl rand -base64 32>`                 | **yes** |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `false`                                                | no      |

Leave unset: `ADMIN_GROUP_ID` and `HELPER_GROUP_ID` (mock falls back to the
seed groups), all `TIDYHQ_*` credentials (live only), `E2E`, and `TZ`. App
settings are encrypted at rest. Key Vault references can wait until
production.

## Logs

- Turn on App Service logs, Application logging: **File System**.
- Portal: **Log stream** shows console output, including startup-config
  errors.
- Terminal: `az webapp log tail --name <app> --resource-group <rg>`.
- Platform and container messages: Diagnose and solve problems, Application
  logs, or Kudu at `https://<scm-host>/api/logs/docker`.
- Ignore `GET /robots933456.txt`: App Service checking the container is up.

## PRs

0. **0.5.3 patch (first, outside this milestone):** Next.js security fix. ✅ Merged (#45).
1. **Standalone build.** 🔍 In review (#46).
   - `output: "standalone"`.
   - `engines` set to `24.x`, with a test that it matches `.nvmrc` (written
     first).
   - A `build:standalone` script that includes the static copy.
   - Playwright runs the standalone `server.js`.
   - Fix the stale "three group ids" comment in `.env.example` (there are
     two).
   - Confirm locally that the standalone server under a bad config behaves
     like `next start` does. Done: it does (see Startup checks).
   - For PR 2: `next start` now prints a warning with standalone output on
     (`"next start" does not work with "output: standalone"`). The `start`
     script is left as is in PR 1; PR 2 points it at `server.js` or removes it.
2. **Deploy workflow and runbook (0.6.0).**
   - `deploy.yml` with the check after deploy.
   - An Azure runbook doc (portal steps, settings, logs).
   - Update CLAUDE.md for the host.

## Portal steps (Mike, between PR 1 and PR 2's first deploy)

Azure:

1. Create a resource group, e.g. `sml-checkin-demo`, in **West US 2**.
2. Create an App Service plan: **Linux, F1**.
3. Create the web app: Code, **Node 24 LTS**, the F1 plan. Leave continuous
   deployment off (the wizard would commit its own workflow). Leave basic-auth
   publishing off.
4. In Configuration, set the startup command
   `HOSTNAME=0.0.0.0 node server.js`. Turn HTTPS Only on, set minimum TLS 1.2,
   disable FTP, and optionally turn session affinity off.
5. Add the app settings above.
6. Turn on App Service logs (File System).
7. OIDC: create a **user-assigned managed identity**. Add a federated
   credential: "GitHub Actions deploying Azure resources", organization
   `mik3ycodez`, repository `sml-checkin`, entity **Environment**, name
   **`demo`** (subject `repo:mik3ycodez/sml-checkin:environment:demo`). In the
   web app's Access control (IAM), give the identity the **Website
   Contributor** role, scoped to the web app only.
8. Add a Cost Management budget alert.

GitHub:

1. Settings, Environments: create **`demo`** and limit its deployment branches
   to `main`.
2. Add environment **variables** (none is a secret): `AZURE_CLIENT_ID` (the
   identity's client ID), `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`,
   `AZURE_WEBAPP_NAME`, `DEMO_URL`.

Rehearse once: delete `SESSION_SECRET`, restart, see the 500s and the named
setting in Log stream, then put the setting back.

When SML moves production to its own account, repeat the Azure and GitHub
steps with a new identity and a `production` environment.

## Sources

- [Configure Node.js apps on App Service (Linux, `NODE|24-lts`, PORT, startup command, logs)](https://learn.microsoft.com/en-us/azure/app-service/configure-language-nodejs)
- [Language runtime support policy](https://learn.microsoft.com/en-us/azure/app-service/language-support-policy)
- [Deploy with GitHub Actions (OIDC, roles, actions)](https://learn.microsoft.com/en-us/azure/app-service/deploy-github-actions)
- [Health check](https://learn.microsoft.com/en-us/azure/app-service/monitor-instances-health-check)
- [App Service limits (F1 vs B1)](https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/azure-subscription-service-limits#app-service-limits)
- [Azure App Service quotas and metrics](https://learn.microsoft.com/azure/app-service/web-sites-monitor)
- [Perpetual free Linux tier announcement](https://azure.microsoft.com/en-in/updates/perpetual-free-tier-offering-for-linux-based-applications-on-app-service/)
- Secondary sources for pricing context (limits above come from Microsoft's
  limits page): [Kuberns, Azure pricing 2026](https://kuberns.com/blogs/azure-pricing/),
  [agentdeals, Azure free tier 2026](https://agentdeals.dev/azure-free-tier-2026),
  [cloudwebschool, Azure free tier](https://cloudwebschool.com/docs/azure/fundamentals/azure-free-tier/)
