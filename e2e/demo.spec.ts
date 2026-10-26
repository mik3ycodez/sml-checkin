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

// Runs in all three projects, including "webkit-no-js": the walkthrough's
// start control is a plain form.
test("the walkthrough's first scenario goes from /demo to the Check in button", async ({
  page,
}) => {
  await page.goto("/");
  // Linked from the banner on every page, and from the home page itself.
  await expect(
    page.getByRole("status").getByRole("link", { name: "Demo walkthrough" }),
  ).toBeVisible();
  await page
    .getByRole("main")
    .getByRole("link", { name: "Demo walkthrough" })
    .click();
  await expect(page).toHaveURL(/\/demo$/);

  // Starting signs out whoever was signed in, so start from someone else.
  await page
    .locator("#scenario-1")
    .getByRole("button", { name: "Start as Dante Ruiz" })
    .click();
  await page.getByRole("button", { name: "Dante Ruiz" }).click();
  await expect(page).toHaveURL(/\/checkin\/ev_tonight$/);
  await expect(page.getByRole("button", { name: "Check in" })).toBeVisible();
});
