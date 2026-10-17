import { expect, test } from "./fixtures";

// The suite runs the app as a demo (DEMO_MODE=on in playwright.config.ts), so
// every page says its data is fake. This is server-rendered, so it must show
// in the webkit-no-js project too.
test("every page carries the Demo data banner, even on a not-found page", async ({
  page,
}) => {
  for (const path of ["/", "/checkin/ev_tonight", "/no-such-page"]) {
    await page.goto(path);
    await expect(
      page.getByRole("status").filter({ hasText: "Demo data" }),
    ).toBeVisible();
  }
});
