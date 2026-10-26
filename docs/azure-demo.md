# Azure demo runbook

The demo runs on **Azure App Service (Linux)** with `TIDYHQ_MODE=mock` and
`DEMO_MODE=on`. It deploys from GitHub Actions
(`.github/workflows/deploy.yml`) with OIDC, so there is no publish profile and
no secret in the repo. The reasons behind these choices are in
[milestone 6](plans/milestone-6.md).

This is the only copy of the portal steps, app settings and log instructions.
Everything below is a placeholder; real values live in the portal and in
GitHub.

## How a deploy happens

1. A push to `main` runs CI. When CI finishes green, `Deploy demo` starts. (A
   pull request run of CI never deploys.) You can also start it by hand from
   the Actions tab (**Run workflow**), which deploys the head of the branch you
   pick; the `demo` environment only allows `main`. **A manual run skips the CI
   gate:** it deploys that commit even if CI failed or is still running on it,
   so check the commit's CI status first.
2. It checks out the exact commit that passed CI, runs
   `npm run build:standalone`, and zips from **inside** `.next/standalone` so
   `server.js` is at the zip root.
3. It signs in to Azure with `azure/login` and deploys the zip with
   `azure/webapps-deploy`. App Service never builds.
4. **It then checks the site** (`scripts/check-deploy.mjs`): `DEMO_URL/` must
   return 200 on this build within 5 minutes, and one stylesheet from
   `/_next/static` must load. If not, the run is red.

A red run after a successful "Deploy" step means the site is up but wrong.
See [When the deploy check fails](#when-the-deploy-check-fails).

Only one deploy runs at a time. A second one waits; a deploy that is running
is never cancelled.

## One-time setup

### Azure portal

1. Create a resource group, e.g. `sml-checkin-demo`, in **West US 2**.
2. Create an App Service plan: **Linux, F1** (free). Move to B1 only if F1
   gets in the way: the daily CPU quota, sleeping, or a custom domain.
3. Create the web app: Code, **Node 24 LTS**, the F1 plan. Leave continuous
   deployment off (the wizard would commit its own workflow). Leave
   basic-auth publishing off.
4. In Configuration, set the startup command
   `HOSTNAME=0.0.0.0 node server.js`. Turn **HTTPS Only** on, set minimum
   TLS to 1.2, disable FTP, and optionally turn session affinity off.
5. Add the [app settings](#app-settings).
6. Turn on App Service logs: Application logging, **File System**.
7. OIDC: create a **user-assigned managed identity**. Add a federated
   credential: "GitHub Actions deploying Azure resources", organization
   `mik3ycodez`, repository `sml-checkin`, entity **Environment**, name
   **`demo`** (subject `repo:mik3ycodez/sml-checkin:environment:demo`). In the
   web app's Access control (IAM), give the identity the **Website
   Contributor** role, scoped to the web app only.
8. Add a Cost Management budget alert (for example $5).

### GitHub

1. Settings, Environments: create **`demo`** and limit its deployment
   branches to `main`.
2. Add environment **variables** (none is a secret):

   | Variable                | Value                                                  |
   | ----------------------- | ------------------------------------------------------ |
   | `AZURE_CLIENT_ID`       | The managed identity's client ID                       |
   | `AZURE_TENANT_ID`       | The Azure tenant ID                                    |
   | `AZURE_SUBSCRIPTION_ID` | The subscription ID                                    |
   | `AZURE_WEBAPP_NAME`     | The web app's name                                     |
   | `DEMO_URL`              | `https://<default domain from the web app's Overview>` |

### On the first deploy, confirm

- The site comes up with `HOSTNAME=0.0.0.0 node server.js`. (App Service sets
  `PORT`; `HOSTNAME` is set to the container's name on some platforms, so we
  override it. If the site works without the override, say so in the plan.)
- Log stream shows the app starting, and the deploy check passes.

### Rehearse once

Delete `SESSION_SECRET`, restart, and watch: `/` returns 500 and Log stream
names the missing setting (never a value). The next deploy would go red. Then
put the setting back and restart.

## App settings

Set in the portal under Settings, Environment variables, App settings.

| Setting                          | Value                                                  | Secret? |
| -------------------------------- | ------------------------------------------------------ | ------- |
| `TIDYHQ_MODE`                    | `mock`                                                 | no      |
| `DEMO_MODE`                      | `on`                                                   | no      |
| `APP_ORIGIN`                     | `https://<default domain from the web app's Overview>` | no      |
| `SESSION_SECRET`                 | `<output of: openssl rand -base64 32>`                 | **yes** |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `false`                                                | no      |

Leave unset: `ADMIN_GROUP_ID` and `HELPER_GROUP_ID` (the mock falls back to
the seed groups), all `TIDYHQ_*` credentials (live only), and `TZ` (the app
uses an explicit `America/Los_Angeles` for dates).

**Never set `E2E` on the demo.** It turns on the public reset route
(`/mock-tidyhq/reset`, no auth, so anyone could reset the demo) and drops the
admin attendee refresh from 30 s to 2 s, which burns F1's CPU quota.

App settings are encrypted at rest. Key Vault references can wait until
production.

## Reset the demo

The mock keeps its data in memory, so **every restart, deploy or F1 sleep
resets it**. To reset on purpose, press **Restart** on the web app's Overview
page. Members stay signed in (the seed contact ids don't change).

## One instance only

The mock store lives in the server process, so the demo must run exactly one
instance.

- F1 has one shared instance and no scale-out.
- On B1 or higher, set Scale out to **Manual, 1**.
- Never start PM2 in cluster mode (`-i`): each process would hold separate
  mock data.

## Logs

- Portal: **Log stream** shows console output, including startup-config
  errors.
- Terminal: `az webapp log tail --name <app> --resource-group <rg>`
- Platform and container messages: Diagnose and solve problems, Application
  logs, or Kudu at `https://<scm-host>/api/logs/docker`.
- Ignore `GET /robots933456.txt`: App Service checking that the container is
  up.

A bad config does **not** crash the server or restart it. The log prints
`✓ Ready`, then the named setting's error on every request, and the site
answers 500. The "Ready" line can't be trusted; only a request tells. That is
why the deploy ends with a check.

## When the deploy check fails

The failing line is in the last step of the `Deploy demo` run.

| Message                                                              | Likely cause                                                                                                                                                                                                                                                                                    | Look at                                                                           |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `never returned 200 … (last: HTTP 500)`                              | Bad config: a missing or invalid setting (`SESSION_SECRET`, `DEMO_MODE`, `APP_ORIGIN`). The server is up.                                                                                                                                                                                       | Log stream: the log names the setting. Fix it in the portal, then **Restart**.    |
| `never returned 200 … (last: HTTP 503)` or `no response (CODE)`      | The app never started: a zip with no `server.js` at its root, a wrong startup command, or the wrong runtime. `CODE` says which kind of failure: `ECONNREFUSED` nothing listening, `ENOTFOUND` a wrong `DEMO_URL`, a `CERT_…` or similar code a TLS problem.                                     | Log stream and Kudu docker logs; the Startup command; the runtime is Node 24 LTS. |
| `never returned 200 … (last: HTTP 200, but the page is not build …)` | The previous version is still answering (the new one didn't start, or the swap is slow). If it happens on every deploy of a healthy build, Next.js may have stopped writing the build id into the page (it does so only when no deployment id is set); the check then needs a different marker. | Log stream, then re-run the job.                                                  |
| `The build id is empty` or the step `test -s .next/BUILD_ID` fails   | The build wrote no `.next/BUILD_ID`. The check refuses to run without it, so the old build can't pass.                                                                                                                                                                                          | The build step's log.                                                             |
| `The CSS file … returned 404`                                        | The static files are missing from the zip.                                                                                                                                                                                                                                                      | The zip step in `deploy.yml` and `npm run build:standalone`.                      |
| `The page has no CSS link`                                           | The page rendered but not as expected (an error page).                                                                                                                                                                                                                                          | Open `DEMO_URL` and Log stream.                                                   |
| F1 over quota: 403 until midnight UTC                                | The daily CPU quota (60 min) is used up.                                                                                                                                                                                                                                                        | Metrics; consider B1.                                                             |

To rehearse the check yourself (the wait is shortened with an environment
variable):

```
npm run build:standalone
npm start    # in another terminal, with the settings above in the environment
CHECK_DEPLOY_TIMEOUT_SECONDS=10 node scripts/check-deploy.mjs http://127.0.0.1:3000 "$(cat .next/BUILD_ID)"
```

## Tiers

F1 versus B1 (CPU quota, Always On, custom domain, cost) is in
[milestone 6](plans/milestone-6.md#tier-and-cost).

## Moving to SML's Azure account

Repeat the Azure and GitHub steps with a new identity, a `production`
environment, and live-mode settings (see the go-live checklist). Revisit a
health check endpoint then; on F1 and a single instance it only gives metrics.
