import { expect, signInAs, test } from "./fixtures";

// Runs in all three projects, including "webkit-no-js": every step is a plain
// form or link.

const STAFF_PAGE = "/admin/events/ev_tonight/checkin";

test("a volunteer searches, sees a verdict, and checks a member in", async ({
  page,
}) => {
  await signInAs(page, "Pat Rivera", STAFF_PAGE);
  await page.getByLabel("Find a member").fill("Dante");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("link", { name: "Dante Ruiz" }).click();
  await expect(page.getByText("Can check in.")).toBeVisible();
  await page.getByRole("button", { name: "Check in Dante Ruiz" }).click();
  await expect(page.getByText("Checked in. +1 point.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Check in/ })).toHaveCount(0);

  // A volunteer never learns why a membership was refused.
  await page.getByRole("link", { name: "Next member" }).click();
  await page.getByLabel("Find a member").fill("Lee");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("link", { name: "Lee Hart" }).click();
  await expect(
    page.getByText("Can't check in here. Please see a Board member."),
  ).toBeVisible();
  await expect(page.getByText(/membership|renew/i)).toHaveCount(0);
});

test("an admin reaches staff check-in from the event page and sees the reason", async ({
  page,
}) => {
  await signInAs(page, "Casey Moreno", "/admin/events/ev_tonight");
  await page.getByRole("link", { name: "Staff check-in" }).click();
  await expect(page).toHaveURL(new RegExp(`${STAFF_PAGE}$`));
  await page.getByLabel("Find a member").fill("Lee");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("link", { name: "Lee Hart" }).click();
  await expect(page.getByText(/No current membership/)).toBeVisible();
});

test("a member who isn't a volunteer is turned away, with a way back", async ({
  page,
}) => {
  await signInAs(page, "Dante Ruiz");
  await page.goto(STAFF_PAGE);
  await expect(page).toHaveURL(/\/admin\/denied\?reason=not_admin/);
  await expect(page.getByText(/App Check-In Volunteers/)).toBeVisible();
  await page.getByRole("link", { name: "Back to check-in" }).click();
  await expect(page).toHaveURL(/\/checkin\/ev_tonight$/);
});
