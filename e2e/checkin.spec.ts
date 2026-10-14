import { expect, signInAs, test } from "./fixtures";

// Tests tagged @nojs also run in the "webkit-no-js" project (JavaScript off),
// because member pages must work on older phones where scripts fail.

test("a member signs in, checks in, and earns a point @nojs", async ({
  page,
}) => {
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

test("reloading shows already checked in, and the total stays 1", async ({
  page,
}) => {
  await signInAs(page, "Dante Ruiz", "/checkin/ev_tonight");
  await page.getByRole("button", { name: "Check in" }).click();
  await expect(page.getByText("+1 point")).toBeVisible();

  await page.goto("/checkin/ev_tonight");
  await expect(
    page.getByRole("heading", { name: "You're already checked in" }),
  ).toBeVisible();
  await expect(page.getByText("Total: 1")).toBeVisible();
  await expect(page.getByRole("button", { name: "Check in" })).toHaveCount(0);
});

test("a member with an expired membership is sent to renew", async ({
  page,
}) => {
  await signInAs(page, "Lee Hart", "/checkin/ev_tonight");

  await expect(
    page.getByRole("heading", { name: "Your membership isn't active" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Renew on TidyHQ" }),
  ).toHaveAttribute("href", /^https:\/\/[a-z0-9-]+\.tidyhq\.com\/?$/);
  await expect(page.getByRole("button", { name: "Check in" })).toHaveCount(0);
});

test("an unknown event shows the unknown-event screen", async ({ page }) => {
  await signInAs(page, "Dante Ruiz", "/checkin/nope");
  await expect(
    page.getByRole("heading", { name: "We couldn't find that event" }),
  ).toBeVisible();
});

test("an event that hasn't opened shows the not-open-yet screen", async ({
  page,
}) => {
  await signInAs(page, "Dante Ruiz", "/checkin/ev_leather_brunch");
  await expect(
    page.getByRole("heading", { name: "Check-in hasn't opened yet" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Check in" })).toHaveCount(0);
});

test("the session cookie is HttpOnly and holds no token", async ({
  page,
  context,
}) => {
  await signInAs(page, "Dante Ruiz", "/checkin/ev_tonight");

  const cookies = await context.cookies();
  const session = cookies.find((c) => c.name === "sml_session");
  expect(session?.httpOnly).toBe(true);

  // The value is `base64url(JSON).signature`: just a contact id and expiry.
  const [body] = session!.value.split(".");
  const payload = JSON.parse(Buffer.from(body, "base64url").toString());
  expect(Object.keys(payload).sort()).toEqual(["contactId", "exp"]);
  expect(payload.contactId).toBe("c_dante");

  // The mock hands out `mock-code-…` codes, and tokens must never be stored.
  for (const cookie of cookies) {
    expect(cookie.value).not.toContain("mock-code");
    expect(cookie.value).not.toContain("mock-token");
  }
});
