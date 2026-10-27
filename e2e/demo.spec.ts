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
    page.locator("body > div").getByRole("link", { name: "Demo walkthrough" }),
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

// The header is a <header> landmark, so the banner stays the layout's only
// `body > div`. Server-rendered, so it also shows in webkit-no-js.
test("every page has the site header, below the demo banner, linking home", async ({
  page,
}) => {
  for (const path of ["/", "/demo", "/no-such-page", "/auth/signin"]) {
    await page.goto(path);
    const header = page.getByRole("banner");
    await expect(header).toBeVisible();
    await expect(header.getByRole("link")).toHaveAttribute("href", "/");
    await expect(header).toContainText("Seattle Men in Leather");
    const banner = await page.getByRole("status").boundingBox();
    const bar = await header.boundingBox();
    expect(bar!.y).toBeGreaterThanOrEqual(banner!.y + banner!.height - 1);
  }
});

test("the header shows the black logo in light and the white one in dark", async ({
  page,
}) => {
  await page.goto("/");
  // The logos are decorative (alt=""), so find the home link by its name and
  // take the logo that is showing.
  const logo = page
    .getByRole("banner")
    .getByRole("link", { name: "Seattle Men in Leather" })
    .locator("img:visible");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(logo).toHaveCount(1);
  await expect(logo).toHaveAttribute("src", "/brand/sml-logo-black.png");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(logo).toHaveCount(1);
  await expect(logo).toHaveAttribute("src", "/brand/sml-logo-white.png");
});
