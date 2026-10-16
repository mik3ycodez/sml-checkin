import { expect, signInAs, test } from "./fixtures";

// Every spec runs in all three projects, including "webkit-no-js" (JavaScript
// off): the admin pages are plain server-rendered HTML.

test("a signed-out visitor is sent to sign in, then lands on /admin", async ({
  page,
}) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/mock-tidyhq\/oauth\/authorize/);
  await page.getByRole("button", { name: "Casey Moreno" }).click();
  await page.waitForURL((url) => url.pathname === "/admin");
  await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();
  await expect(page.getByText("Signed in as Casey Moreno")).toBeVisible();
});

test("a member who isn't in the App Admin group is turned away", async ({
  page,
}) => {
  await signInAs(page, "Dante Ruiz");
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/denied\?reason=not_admin$/);
  await expect(
    page.getByRole("heading", { name: "You don't have access" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Admin" })).toHaveCount(0);
});

test("the denied page itself sends a signed-out visitor to sign in", async ({
  page,
}) => {
  await page.goto("/admin/denied?reason=not_admin");
  await expect(page).toHaveURL(/\/mock-tidyhq\/oauth\/authorize/);
});

test("an admin sees the upcoming events, each linking to its admin page", async ({
  page,
}) => {
  await signInAs(page, "Casey Moreno", "/admin");
  await expect(page.getByRole("heading", { name: "Upcoming" })).toBeVisible();
  for (const name of [
    "Social Night",
    "Bootblack Social",
    "Monthly Bar Night",
  ]) {
    await expect(page.getByRole("link", { name })).toBeVisible();
  }
  await expect(
    page.getByRole("link", { name: "Social Night" }),
  ).toHaveAttribute("href", "/admin/events/ev_tonight");
  await expect(page.getByText("No attendance group")).toHaveCount(0);
});

test("a member never sees the event list, even by asking for it directly", async ({
  page,
}) => {
  await signInAs(page, "Dante Ruiz");
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/denied\?reason=not_admin$/);
  await expect(page.getByText("Social Night")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Upcoming" })).toHaveCount(0);
});
