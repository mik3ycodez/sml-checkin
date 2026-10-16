import { expect, signInAs, test } from "./fixtures";

// Runs in all three projects, including "webkit-no-js" (JavaScript off): the
// report is plain server-rendered HTML.

test("an admin opens the club colors report from the admin home and sees the groups", async ({
  page,
}) => {
  await signInAs(page, "Casey Moreno", "/admin");
  await page.getByRole("link", { name: "Club colors owed" }).click();
  await expect(page).toHaveURL(/\/admin\/reports\/colors$/);

  await expect(
    page.getByRole("heading", { name: "Ready to receive colors (1)" }),
  ).toBeVisible();
  await expect(page.getByText("Taylor Brandt")).toBeVisible();
  await expect(page.getByText("18 points · Current member")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Needs to renew or pay first (0)" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Needs checking (0)" }),
  ).toBeVisible();
  // Issued (Morgan) and 17-point (Riley) members aren't owed colors.
  await expect(page.getByText("Morgan Hale")).toHaveCount(0);
  await expect(page.getByText("Riley Frost")).toHaveCount(0);
  await expect(page.getByText(/TidyHQ is the official record/)).toBeVisible();
});

test("a member is turned away from the report", async ({ page }) => {
  await signInAs(page, "Dante Ruiz");
  await page.goto("/admin/reports/colors");
  await expect(page).toHaveURL(/\/admin\/denied\?reason=not_admin/);
  await expect(page.getByText("Taylor Brandt")).toHaveCount(0);
});
