import { expect, openMenu, signInAs, test } from "./fixtures";

// The header's account menu. Runs in all three projects, JavaScript off too:
// it is a native <details>.

test("a member with no photo gets initials, and the menu names them", async ({
  page,
}) => {
  await signInAs(page, "Dante Ruiz", "/checkin/ev_tonight");
  const chip = page.getByLabel("Account menu, signed in as Dante Ruiz");
  await expect(chip).toBeVisible();
  await expect(chip.getByText("DR")).toBeVisible();
  await expect(chip.locator("img")).toHaveCount(0);

  await openMenu(page);
  await expect(
    page.getByText("Dante Ruiz", { exact: true }).last(),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
});

test("a member with a photo gets it, drawn over the initials", async ({
  page,
  request,
}) => {
  await signInAs(page, "Marcus Bell", "/checkin/ev_tonight");
  const photo = page
    .getByLabel("Account menu, signed in as Marcus Bell")
    .locator("img");
  await expect(photo).toHaveAttribute("src", "/mock/marcus.svg");
  await expect(photo).toHaveAttribute("referrerpolicy", "no-referrer");
  await expect(photo).toHaveAttribute("alt", "");
  expect((await request.get("/mock/marcus.svg")).status()).toBe(200);
});

test("the header and menu fit the screen, and Check in is not covered", async ({
  page,
}) => {
  await signInAs(page, "Marcus Bell", "/checkin/ev_tonight");
  await openMenu(page);
  const viewport = page.viewportSize()!;
  const panel = page.locator("details > div").first();
  const box = (await panel.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  const header = (await page.getByRole("banner").boundingBox())!;
  expect(header.width).toBeLessThanOrEqual(viewport.width);
  // No sideways scroll.
  const scrollWidth = await page
    .evaluate(() => document.documentElement.scrollWidth)
    .catch(() => viewport.width);
  expect(scrollWidth).toBeLessThanOrEqual(viewport.width);
});

test("signed out, the open Menu shows Sign in inside the screen", async ({
  page,
}) => {
  await page.goto("/");
  await openMenu(page);
  const viewport = page.viewportSize()!;
  const box = (await page
    .getByRole("link", { name: "Sign in" })
    .boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
});

test("signed out, the header offers a Menu with Sign in", async ({ page }) => {
  await page.goto("/");
  await openMenu(page);
  await page.getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/mock-tidyhq\/oauth\/authorize/);
});
