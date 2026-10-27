import { expect, openMenu, signInAs, signOut, test } from "./fixtures";

// Every spec runs in all three projects, including "webkit-no-js" (JavaScript
// off): /me is plain server-rendered HTML.

const TIDYHQ = /^https:\/\/[a-z0-9-]+\.tidyhq\.com\/?$/;

test("a signed-out visitor is sent to sign in, then lands on /me", async ({
  page,
}) => {
  await page.goto("/me");
  await expect(page).toHaveURL(/\/mock-tidyhq\/oauth\/authorize/);
  await page.getByRole("button", { name: "Dante Ruiz" }).click();
  await page.waitForURL((url) => url.pathname === "/me");
  await expect(page.getByRole("heading", { name: "Dante Ruiz" })).toBeVisible();
});

test("Dante checks in, follows the link, and sees his point and the event", async ({
  page,
}) => {
  await signInAs(page, "Dante Ruiz", "/checkin/ev_tonight");
  await page.getByRole("button", { name: "Check in" }).click();
  await expect(page.getByText("+1 point")).toBeVisible();

  await page.getByRole("link", { name: "See your points" }).click();
  await expect(page).toHaveURL(/\/me$/);
  await expect(page.getByRole("heading", { name: "Dante Ruiz" })).toBeVisible();
  await expect(page.getByText("Full Member")).toBeVisible();
  await expect(page.getByText("Points: 1")).toBeVisible();
  await expect(page.getByText(/Active until/)).toBeVisible();
  await expect(page.getByText("Social Night")).toBeVisible();
  await expect(page.getByText(/17 more points/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Renew/ })).toHaveCount(0);
});

test("a member who hasn't been to anything sees no events", async ({
  page,
}) => {
  await signInAs(page, "Dante Ruiz", "/me");
  await expect(page.getByText("Points: 0")).toBeVisible();
  await expect(page.getByText("No events in the last 90 days")).toBeVisible();
});

test("a member's past events come from archived groups too", async ({
  page,
}) => {
  await signInAs(page, "Marcus Bell", "/me");
  await expect(page.getByText("Pub Night")).toBeVisible();
  // Non-event groups (Members, Volunteers) never show up as events.
  await expect(page.getByText("Volunteers")).toHaveCount(0);
});

test("Sam is reminded to renew", async ({ page }) => {
  await signInAs(page, "Sam Okafor", "/me");
  await expect(page.getByText(/Your membership ends on .+/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Renew/ })).toHaveAttribute(
    "href",
    TIDYHQ,
  );
});

test("Robin is in the grace period and told when to renew by", async ({
  page,
}) => {
  await signInAs(page, "Robin Vale", "/me");
  await expect(
    page.getByText(
      /Your membership expired on .+\. Renew by .+ to keep earning points\./,
    ),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Renew/ })).toHaveAttribute(
    "href",
    TIDYHQ,
  );
});

test("Avery has a balance due and is told to pay in TidyHQ", async ({
  page,
}) => {
  await signInAs(page, "Avery Quinn", "/me");
  await expect(
    page.getByText("You have a balance due. Complete payment in TidyHQ."),
  ).toBeVisible();
  await expect(page.getByText(/Your membership ends on/)).toHaveCount(0);
});

test("Lee, expired past the grace period, is told to renew", async ({
  page,
}) => {
  await signInAs(page, "Lee Hart", "/me");
  await expect(page.getByText(/Your membership expired on/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Renew/ })).toHaveAttribute(
    "href",
    TIDYHQ,
  );
});

test("Riley, 17 points, is one short of club colors", async ({ page }) => {
  await signInAs(page, "Riley Frost", "/me");
  await expect(page.getByText("Points: 17")).toBeVisible();
  await expect(
    page.getByText("1 more point until you qualify for club colors."),
  ).toBeVisible();
});

test("Taylor, 18 points, qualifies for club colors", async ({ page }) => {
  await signInAs(page, "Taylor Brandt", "/me");
  await expect(
    page.getByText(
      "You qualify for club colors! A Board member will connect with you to distribute your club colors.",
    ),
  ).toBeVisible();
});

test("Morgan has been issued club colors", async ({ page }) => {
  await signInAs(page, "Morgan Hale", "/me");
  await expect(page.getByText("Club colors received ✓")).toBeVisible();
});

test("signing out from /me leads back to sign-in", async ({ page }) => {
  await signInAs(page, "Dante Ruiz", "/me");
  await signOut(page);
  await expect(page).toHaveURL(/\/mock-tidyhq\/oauth\/authorize/);
});

test("the splash page leads, through sign-in, to the member's status", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "My points and status" }).click();
  await page.getByRole("button", { name: "Dante Ruiz" }).click();
  await expect(page).toHaveURL(/\/me$/);
  await expect(
    page.getByLabel("Account menu, signed in as Dante Ruiz"),
  ).toBeVisible();
});

test("My points and status in the header menu opens /me", async ({ page }) => {
  await signInAs(page, "Dante Ruiz", "/checkin/ev_tonight");
  await openMenu(page);
  await page
    .getByRole("link", { name: "My points and status" })
    .first()
    .click();
  await expect(page).toHaveURL(/\/me$/);
});
