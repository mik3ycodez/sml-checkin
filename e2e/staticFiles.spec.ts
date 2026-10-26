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
