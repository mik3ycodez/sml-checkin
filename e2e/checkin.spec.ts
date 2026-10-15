import { expect, signInAs, test } from "./fixtures";

// Every spec runs in all three projects, including "webkit-no-js" (JavaScript
// off), because member pages must work on phones where scripts fail.

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

test("a member expired past the grace period is sent to renew", async ({
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

test("a member in the grace period checks in and is told when to renew by", async ({
  page,
}) => {
  await signInAs(page, "Robin Vale", "/checkin/ev_tonight");
  await page.getByRole("button", { name: "Check in" }).click();

  await expect(
    page.getByRole("heading", { name: "You're checked in, Robin Vale!" }),
  ).toBeVisible();
  await expect(page.getByText("+1 point")).toBeVisible();
  await expect(page.getByText("Total: 1")).toBeVisible();
  await expect(
    page.getByText(
      /Your membership expired on .+\. Renew by .+ to keep earning points\./,
    ),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Renew/ })).toHaveAttribute(
    "href",
    /^https:\/\/[a-z0-9-]+\.tidyhq\.com\/?$/,
  );
});

test("a member with a balance due checks in and is told to pay in TidyHQ", async ({
  page,
}) => {
  await signInAs(page, "Avery Quinn", "/checkin/ev_tonight");
  await page.getByRole("button", { name: "Check in" }).click();

  await expect(
    page.getByRole("heading", { name: "You're checked in, Avery Quinn!" }),
  ).toBeVisible();
  await expect(page.getByText("+1 point")).toBeVisible();
  await expect(
    page.getByText("You have a balance due. Complete payment in TidyHQ."),
  ).toBeVisible();
  await expect(page.getByText(/expired on/)).toHaveCount(0);
});

test("a member whose check-in brings them to 18 points is told they qualify for club colors", async ({
  page,
}) => {
  await signInAs(page, "Riley Frost", "/checkin/ev_tonight");
  await page.getByRole("button", { name: "Check in" }).click();

  await expect(
    page.getByRole("heading", { name: "You're checked in, Riley Frost!" }),
  ).toBeVisible();
  await expect(page.getByText("+1 point")).toBeVisible();
  await expect(page.getByText("Total: 18")).toBeVisible();
  await expect(
    page.getByText(
      "You qualify for club colors! A Board member will connect with you to distribute your club colors.",
    ),
  ).toBeVisible();

  // Only on the tap that reached 18, not on a reload.
  await page.goto("/checkin/ev_tonight");
  await expect(
    page.getByRole("heading", { name: "You're already checked in" }),
  ).toBeVisible();
  await expect(page.getByText(/club colors/)).toHaveCount(0);
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
