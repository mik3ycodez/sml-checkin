// Run by the deploy workflow after the zip is deployed:
//   node scripts/check-deploy.mjs <url> [<build id>]
//
// A bad config does not crash the server: it stays up and answers 500 to every
// request, and "✓ Ready" prints anyway. A deploy also reports success when the
// zip has no server.js at its root. So the only reliable check is a request.
// Wait for the page to return 200 (a cold start can take minutes), then fetch
// one stylesheet, which a standalone build serves only if the static copy ran,
// and one logo, which it serves only if public/ was copied in too.
//
// With a build id, a 200 only counts if the HTML carries that id, so the
// previous build answering during the swap can't pass for the new one.

import { pathToFileURL } from "node:url";

const LOGO_PATH = "/brand/sml-logo-black.png";
const CSS_LINK = /href="([^"]*\/_next\/static\/[^"]*\.css[^"]*)"/;

/**
 * Why a request failed, safe to log. Node's fetch throws "TypeError: fetch
 * failed" and puts the reason in error.cause.code (ECONNREFUSED, ENOTFOUND,
 * a certificate code). Only that code or the error's name is returned, never a
 * message, which can carry the host, a URL with credentials, or a body.
 */
function describeError(error) {
  const code = error?.cause?.code;
  if (typeof code === "string" && /^[A-Za-z0-9_]{1,64}$/.test(code)) {
    return code;
  }
  return error instanceof Error ? error.name : "error";
}

/**
 * Fetch one file and require a 200 with the expected content type. A 200 alone
 * isn't enough: a server that lacks the file can answer with an HTML page.
 * Messages are fixed text plus the status, never anything the server sent back.
 */
async function expectFile({ url, type, label, hint, timeoutMs }) {
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    await res.arrayBuffer();
  } catch (error) {
    throw new Error(`${label} did not load (${describeError(error)}).`);
  }
  if (res.status !== 200) {
    throw new Error(`${label} returned ${res.status}. ${hint}`);
  }
  const actual = res.headers.get("content-type") ?? "";
  if (!actual.toLowerCase().startsWith(type)) {
    throw new Error(`${label} returned 200 but not ${type}. ${hint}`);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {object} options
 * @param {string} options.url Site root, e.g. https://example.azurewebsites.net
 * @param {string} [options.buildId] Contents of .next/BUILD_ID for this build
 * @param {number} [options.timeoutMs] How long to wait for the page
 * @param {number} [options.intervalMs] Pause between tries
 * @param {number} [options.requestTimeoutMs] Limit for one request
 * @param {(line: string) => void} [options.log]
 * @returns {Promise<void>} Resolves when the check passes, rejects with the reason
 */
export async function checkDeploy({
  url,
  buildId,
  timeoutMs = 5 * 60 * 1000,
  intervalMs = 10 * 1000,
  requestTimeoutMs = 15 * 1000,
  log = console.log,
}) {
  // Fail closed: "" would read as "accept any 200", so the previous build
  // answering during the swap would pass. Leave it out (undefined) to skip.
  if (buildId !== undefined && !buildId.trim()) {
    throw new Error(
      "The build id is empty (is .next/BUILD_ID missing?). Not checking without it.",
    );
  }
  const root = new URL("/", url);
  const deadline = Date.now() + timeoutMs;
  let last = "no response";
  let html;

  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(root, {
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
      const body = await res.text();
      if (res.status !== 200) {
        last = `HTTP ${res.status}`;
      } else if (buildId && !body.includes(buildId)) {
        last = `HTTP 200, but the page is not build ${buildId} (the previous version?)`;
      } else {
        html = body;
        log(`try ${attempt}: HTTP 200`);
        break;
      }
    } catch (error) {
      last = `no response (${describeError(error)})`;
    }
    log(`try ${attempt}: ${last}`);
    if (Date.now() + intervalMs >= deadline) {
      throw new Error(
        `${root.origin}/ never returned 200 within ${Math.round(timeoutMs / 1000)}s ` +
          `(last: ${last}). Check Log stream in the Azure portal.`,
      );
    }
    await sleep(intervalMs);
  }

  const href = CSS_LINK.exec(html)?.[1];
  if (!href) {
    throw new Error("The page has no CSS link under /_next/static.");
  }
  const cssUrl = new URL(href, root);
  await expectFile({
    url: cssUrl,
    type: "text/css",
    label: `The CSS file ${cssUrl.pathname}`,
    hint: "The static files are probably missing from the zip.",
    timeoutMs: requestTimeoutMs,
  });
  log(`CSS ${cssUrl.pathname}: HTTP 200`);

  await expectFile({
    url: new URL(LOGO_PATH, root),
    type: "image/png",
    label: `The logo ${LOGO_PATH}`,
    hint: "The public folder is probably missing from the zip.",
    timeoutMs: requestTimeoutMs,
  });
  log(`Logo ${LOGO_PATH}: HTTP 200`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [url, buildId] = process.argv.slice(2);
  if (!url) {
    console.error("Usage: node scripts/check-deploy.mjs <url> [<build id>]");
    process.exit(2);
  }
  try {
    // Shortens the wait when rehearsing a failure locally; the workflow leaves it unset.
    const seconds = Number(process.env.CHECK_DEPLOY_TIMEOUT_SECONDS);
    await checkDeploy({
      url,
      buildId,
      ...(seconds > 0 && { timeoutMs: seconds * 1000, intervalMs: 1000 }),
    });
    console.log("Deploy check passed.");
  } catch (error) {
    console.error(
      `Deploy check failed: ${error instanceof Error ? error.message : error}`,
    );
    process.exit(1);
  }
}
