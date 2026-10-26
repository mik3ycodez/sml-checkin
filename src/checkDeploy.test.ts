import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { checkDeploy } from "../scripts/check-deploy.mjs";

// The deploy workflow runs this script against the demo after every deploy.
// Each test stands in for one way a deploy goes wrong, against a local server.

const BUILD_ID = "buildid123";
const CSS = "/_next/static/chunks/app.css";
const page = (buildId = BUILD_ID, css: string | null = CSS) =>
  `<html><head>${css ? `<link rel="stylesheet" href="${css}">` : ""}</head>` +
  `<body><script>self.__next_f.push([1,"{\\"b\\":\\"${buildId}\\"}"])</script></body></html>`;

type Handler = (req: IncomingMessage) => { status: number; body?: string };

let server: Server | undefined;

async function serve(handler: Handler): Promise<string> {
  server = createServer((req, res) => {
    const { status, body } = handler(req);
    res.statusCode = status;
    res.end(body ?? "");
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

afterEach(async () => {
  const s = server;
  server = undefined;
  if (s) await new Promise((resolve) => s.close(resolve));
});

const fast = {
  timeoutMs: 400,
  intervalMs: 20,
  requestTimeoutMs: 200,
  log: () => {},
};

describe("checkDeploy", () => {
  it("passes when the page is 200 with this build and its CSS loads", async () => {
    const url = await serve((req) =>
      req.url === CSS
        ? { status: 200, body: "a{}" }
        : { status: 200, body: page() },
    );
    await expect(
      checkDeploy({ url, buildId: BUILD_ID, ...fast }),
    ).resolves.toBeUndefined();
  });

  it("fails on a bad config, where every request is a 500", async () => {
    const url = await serve(() => ({
      status: 500,
      body: "Internal Server Error",
    }));
    await expect(
      checkDeploy({ url, buildId: BUILD_ID, ...fast }),
    ).rejects.toThrow(/500/);
  });

  it("keeps waiting through a cold start, then passes", async () => {
    let calls = 0;
    const url = await serve((req) => {
      if (req.url === CSS) return { status: 200, body: "a{}" };
      return ++calls < 4 ? { status: 503 } : { status: 200, body: page() };
    });
    await expect(
      checkDeploy({ url, buildId: BUILD_ID, ...fast }),
    ).resolves.toBeUndefined();
    expect(calls).toBe(4);
  });

  it("fails when nothing is listening, as with a zip that has no server.js", async () => {
    const url = await serve(() => ({ status: 200 }));
    await new Promise((resolve) => server!.close(resolve));
    await expect(
      checkDeploy({ url, buildId: BUILD_ID, ...fast }),
    ).rejects.toThrow(/never returned 200/i);
  });

  it("fails when the page is fine but the CSS is missing", async () => {
    const url = await serve((req) =>
      req.url === CSS ? { status: 404 } : { status: 200, body: page() },
    );
    await expect(
      checkDeploy({ url, buildId: BUILD_ID, ...fast }),
    ).rejects.toThrow(/css.*404/i);
  });

  it("fails when the page has no CSS link at all", async () => {
    const url = await serve(() => ({
      status: 200,
      body: page(BUILD_ID, null),
    }));
    await expect(
      checkDeploy({ url, buildId: BUILD_ID, ...fast }),
    ).rejects.toThrow(/no css/i);
  });

  it("does not accept a 200 from the previous build", async () => {
    const url = await serve(() => ({ status: 200, body: page("oldbuild") }));
    await expect(
      checkDeploy({ url, buildId: BUILD_ID, ...fast }),
    ).rejects.toThrow(/build/i);
  });

  it("without a build id, accepts any 200", async () => {
    const url = await serve((req) =>
      req.url === CSS
        ? { status: 200 }
        : { status: 200, body: page("whatever") },
    );
    await expect(checkDeploy({ url, ...fast })).resolves.toBeUndefined();
  });

  it("follows a CSS link that includes the site origin", async () => {
    let origin = "";
    const url = await serve((req) =>
      req.url === CSS
        ? { status: 200 }
        : { status: 200, body: page(BUILD_ID, `${origin}${CSS}`) },
    );
    origin = url;
    await expect(
      checkDeploy({ url, buildId: BUILD_ID, ...fast }),
    ).resolves.toBeUndefined();
  });
});
