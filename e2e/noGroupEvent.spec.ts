import { expect, signInAs, test } from "./fixtures";

// The seed's Pop-up Meetup is open now but has no attendance group, so no one
// can be recorded. No waiting on real time, so it runs in all three projects,
// including "webkit-no-js".

const ADMIN_PAGE = "/admin/events/ev_no_group";
const STAFF_PAGE = `${ADMIN_PAGE}/checkin`;

test("the admin event page gives the reason instead of a QR code", async ({
  page,
}) => {
  await signInAs(page, "Casey Moreno", ADMIN_PAGE);
  await expect(
    page.getByText(/no attendance group, so check-in can't record anyone/),
  ).toBeVisible();
  await expect(page.getByRole("img", { name: /QR code/ })).toHaveCount(0);
  await expect(page.getByText(/check-in is open/i)).toHaveCount(0);
  await expect(page.getByText(/using the event's start and end/i)).toHaveCount(
    0,
  );
});

test("a member's check-in is refused", async ({ page }) => {
  await signInAs(page, "Dante Ruiz", "/checkin/ev_no_group");
  // The member page treats an event with no group as one it can't find.
  await expect(
    page.getByRole("heading", { name: "We couldn't find that event" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Check in" })).toHaveCount(0);
});

test("a volunteer can't open its staff page", async ({ page }) => {
  await signInAs(page, "Pat Rivera", STAFF_PAGE);
  await expect(
    page.getByRole("heading", { name: "Volunteer mode has ended" }),
  ).toBeVisible();
  await expect(page.getByLabel("Find a member")).toHaveCount(0);
});

test("an admin's staff page says why check-in can't run", async ({ page }) => {
  await signInAs(page, "Casey Moreno", STAFF_PAGE);
  await expect(
    page.getByRole("heading", { name: "Check-in can't run for this event" }),
  ).toBeVisible();
  await expect(page.getByText(/no attendance group in TidyHQ/)).toBeVisible();
});
