import { expect, signInAs, test } from "./fixtures";

// Kai Mercer's only membership is marked expired with an end date in the
// future: a data problem in TidyHQ. Runs in all three projects.

const STAFF_PAGE = "/admin/events/ev_tonight/checkin";

async function openKai(page: import("@playwright/test").Page) {
  await page.getByLabel("Find a member").fill("Kai");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("link", { name: "Kai Mercer" }).click();
}

test("self check-in is refused", async ({ page }) => {
  await signInAs(page, "Kai Mercer", "/checkin/ev_tonight");
  await expect(
    page.getByRole("heading", { name: "Your membership isn't active" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Check in" })).toHaveCount(0);
});

test("an admin sees the refusal and the inconsistent-membership warning", async ({
  page,
}) => {
  await signInAs(page, "Casey Moreno", STAFF_PAGE);
  await openKai(page);
  await expect(page.getByText(/No current membership/)).toBeVisible();
  await expect(
    page
      .getByRole("alert")
      .getByText(/m_kai is marked expired but its end date/),
  ).toBeVisible();
});

test("a volunteer sees only the generic line", async ({ page }) => {
  await signInAs(page, "Pat Rivera", STAFF_PAGE);
  await openKai(page);
  await expect(
    page.getByText("Can't check in here. Please see a Board member."),
  ).toBeVisible();
  // (Not role=alert: Next's route announcer is always one, and empty.)
  await expect(page.getByText(/membership|expired|m_kai/i)).toHaveCount(0);
});
