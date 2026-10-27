import { expect, test } from "./fixtures";

// The standalone server doesn't copy `.next/static` itself (`build:standalone`
// does). Without it every page loads unstyled and nothing else here notices.
// One browser is enough: this checks the server, not the browser.
test("the page's stylesheet is served from /_next/static", async ({
  page,
  request,
}) => {
  test.skip(
    test.info().project.name !== "chromium",
    "checks the server, not the browser; chromium covers it",
  );
  await page.goto("/");
  const href = await page
    .locator('link[rel="stylesheet"][href*="/_next/static"]')
    .first()
    .getAttribute("href");
  expect(href, "a stylesheet link under /_next/static").not.toBeNull();

  const response = await request.get(href!);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/css");
});

// `.next/standalone` has no public/ unless build:standalone copies it in. Without
// it the logos and icons 404 on the built server and on Azure.
test("brand files and the web manifest are served", async ({
  page,
  request,
}) => {
  test.skip(
    test.info().project.name !== "chromium",
    "checks the server, not the browser; chromium covers it",
  );
  for (const path of [
    "/brand/sml-logo-black.png",
    "/brand/sml-icon-192.png",
    "/favicon.ico",
    "/brand/apple-touch-icon.png",
  ]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()["content-type"], path).toContain("image/png");
  }

  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href, "a manifest link").not.toBeNull();
  const manifest = await request.get(href!);
  expect(manifest.status()).toBe(200);
  expect((await manifest.json()).name).toBe("SML Check-in");

  await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute(
    "href",
    "/brand/sml-icon-192.png",
  );
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    "href",
    "/brand/apple-touch-icon.png",
  );
});
