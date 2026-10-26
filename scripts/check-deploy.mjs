// Run by the deploy workflow after the zip is deployed:
//   node scripts/check-deploy.mjs <url> [<build id>]
//
// A bad config does not crash the server: it stays up and answers 500 to every
// request, and "✓ Ready" prints anyway. A deploy also reports success when the
// zip has no server.js at its root. So the only reliable check is a request.
// Wait for the page to return 200 (a cold start can take minutes), then fetch
// one stylesheet, which a standalone build serves only if the static copy ran.
//
// With a build id, a 200 only counts if the HTML carries that id, so the
// previous build answering during the swap can't pass for the new one.

import { pathToFileURL } from "node:url";

const CSS_LINK = /href="([^"]*\/_next\/static\/[^"]*\.css[^"]*)"/;

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
      // Only the error's name: a message can carry the host or other detail.
      last = `no response (${error instanceof Error ? error.name : "error"})`;
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
  let status;
  try {
    const res = await fetch(cssUrl, {
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    await res.arrayBuffer();
    status = res.status;
  } catch (error) {
    throw new Error(
      `The CSS file ${cssUrl.pathname} did not load (${error instanceof Error ? error.name : "error"}).`,
    );
  }
  if (status !== 200) {
    throw new Error(
      `The CSS file ${cssUrl.pathname} returned ${status}. ` +
        "The static files are probably missing from the zip.",
    );
  }
  log(`CSS ${cssUrl.pathname}: HTTP 200`);
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
    await checkDeploy({ url, buildId: buildId || undefined });
    console.log("Deploy check passed.");
  } catch (error) {
    console.error(
      `Deploy check failed: ${error instanceof Error ? error.message : error}`,
    );
    process.exit(1);
  }
}
