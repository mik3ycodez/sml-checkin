// Test-only proxy in front of `next start`. The production build marks every
// cookie `Secure`, and WebKit won't store those from http://localhost (Chromium
// does). This strips the flag so the WebKit project can sign in, while the
// app's real cookie settings stay as they are. Redirects pass through
// untouched, which is why this isn't done inside the browser.
import http from "node:http";

const [listenPort, targetPort] = process.argv.slice(2).map(Number);

http
  .createServer((req, res) => {
    const upstream = http.request(
      {
        host: "localhost",
        port: targetPort,
        method: req.method,
        path: req.url,
        headers: req.headers, // includes Host, so the app sees its public origin
      },
      (up) => {
        const headers = { ...up.headers };
        if (headers["set-cookie"]) {
          headers["set-cookie"] = headers["set-cookie"].map((cookie) =>
            cookie.replace(/;\s*secure\b/gi, ""),
          );
        }
        res.writeHead(up.statusCode ?? 502, headers);
        up.pipe(res);
      },
    );
    upstream.on("error", () => {
      res.writeHead(502).end("Bad gateway");
    });
    req.pipe(upstream);
  })
  .listen(listenPort);
