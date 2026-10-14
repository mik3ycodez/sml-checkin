import { expect, signInAs, test } from "./fixtures";

test("a member signs in, checks in, and earns a point", async ({ page }) => {
  await signInAs(page, "Dante Ruiz", "/checkin/ev_tonight");

  await expect(
    page.getByRole("heading", { name: "Social Night" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Check in" }).click();

  await expect(
    page.getByRole("heading", { name: "You're checked in, Dante Ruiz!" }),
  ).toBeVisible();
  await expect(page.getByText("+1 point")).toBeVisible();
  await expect(page.getByText("Total: 1")).toBeVisible();
});
