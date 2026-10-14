import { expect, signInAs, test } from "./fixtures";

test("two tabs signing in at once both succeed", async ({ context, page }) => {
  const other = await context.newPage();
  await page.goto("/auth/signin?returnTo=%2Fcheckin%2Fev_tonight");
  await other.goto("/auth/signin?returnTo=%2Fcheckin%2Fev_pub_night");

  await page.getByRole("button", { name: "Dante Ruiz" }).click();
  await page.waitForURL("**/checkin/ev_tonight");
  await other.getByRole("button", { name: "Dante Ruiz" }).click();
  await other.waitForURL("**/checkin/ev_pub_night");

  await expect(
    page.getByRole("heading", { name: "Social Night" }),
  ).toBeVisible();
  // Pub Night is over, so this tab shows its closed screen: not an error.
  await expect(other.getByText("Pub Night")).toBeVisible();
  await expect(other.getByText("Sign-in failed")).toHaveCount(0);
});

test("a bad code lands on the error page", async ({ page }) => {
  await page.goto("/auth/signin?returnTo=%2Fcheckin%2Fev_tonight");
  const state = new URL(page.url()).searchParams.get("state");
  expect(state).toBeTruthy();

  await page.goto(`/auth/callback?code=not-a-real-code&state=${state}`);
  await expect(
    page.getByRole("heading", { name: "Sign-in failed" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Try again" })).toBeVisible();
});

test("a reused code lands on the error page", async ({ page }) => {
  await page.goto("/auth/signin?returnTo=%2Fcheckin%2Fev_tonight");
  const callback = page.waitForRequest(
    (r) => new URL(r.url()).pathname === "/auth/callback",
  );
  await page.getByRole("button", { name: "Dante Ruiz" }).click();
  const callbackUrl = (await callback).url();
  await page.waitForURL("**/checkin/ev_tonight");

  await page.goto(callbackUrl);
  await expect(
    page.getByRole("heading", { name: "Sign-in failed" }),
  ).toBeVisible();
});

test("sign-out from another site is refused", async ({ page }) => {
  await signInAs(page, "Dante Ruiz", "/checkin/ev_tonight");

  const refused = await page.request.post("/auth/signout", {
    headers: { "sec-fetch-site": "cross-site" },
  });
  expect(refused.status()).toBe(403);

  // Still signed in.
  await page.goto("/checkin/ev_tonight");
  await expect(page.getByRole("button", { name: "Check in" })).toBeVisible();
});

test("sign-out from this site signs the member out", async ({ page }) => {
  await signInAs(page, "Dante Ruiz", "/checkin/ev_tonight");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in as…" }),
  ).toBeVisible();
});
