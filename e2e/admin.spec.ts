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

const EVENT_PATH = "/admin/events/ev_tonight";

test("an admin opens an event from the list and sees its QR code and check-in link", async ({
  page,
}) => {
  await signInAs(page, "Casey Moreno", "/admin");
  await page.getByRole("link", { name: "Social Night" }).click();
  await expect(page).toHaveURL(EVENT_PATH);
  await expect(
    page.getByRole("heading", { name: "Social Night" }),
  ).toBeVisible();
  await expect(page.getByText("Check-in is open.")).toBeVisible();
  // The link the code points to, as text, on this site's own origin.
  await expect(
    page.getByText("http://localhost:3100/checkin/ev_tonight"),
  ).toBeVisible();
  // Drawn on the server, so it's there with JavaScript off too.
  const qr = page.getByRole("img", { name: /QR code for checking in/ });
  await expect(qr).toBeVisible();
  await expect(qr.locator("svg")).toHaveCount(1);
  // No warning for a valid window.
  await expect(page.getByText("Check the check-in window")).toHaveCount(0);
});

test("an event with no window set says check-in uses its start and end", async ({
  page,
}) => {
  await signInAs(page, "Casey Moreno", "/admin/events/ev_bar_night");
  await expect(
    page.getByRole("heading", { name: "Monthly Bar Night" }),
  ).toBeVisible();
  await expect(page.getByText("the event's start and end")).toBeVisible();
  await expect(page.getByRole("img", { name: /QR code/ })).toBeVisible();
});

test("the event page prints as the QR code and its details, without the controls", async ({
  page,
}) => {
  await signInAs(page, "Casey Moreno", EVENT_PATH);
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("img", { name: /QR code/ })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Social Night" }),
  ).toBeVisible();
  await expect(
    page.getByText("http://localhost:3100/checkin/ev_tonight"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeHidden();
  await expect(page.getByRole("link", { name: "All events" })).toBeHidden();
});

test("printing from a dark-mode phone gives dark text on white, not faint gray", async ({
  page,
}) => {
  await signInAs(page, "Casey Moreno", EVENT_PATH);
  await page.emulateMedia({ media: "print", colorScheme: "dark" });
  const heading = page.getByRole("heading", { name: "Social Night" });
  await expect(heading).toHaveCSS("color", "rgb(23, 23, 23)");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  // On screen in dark mode, the same page is light on dark.
  await page.emulateMedia({ media: "screen", colorScheme: "dark" });
  await expect(heading).toHaveCSS("color", "rgb(237, 237, 237)");
});

test("a signed-out visitor to an event page signs in and comes back to it", async ({
  page,
}) => {
  await page.goto(EVENT_PATH);
  await expect(page).toHaveURL(/\/mock-tidyhq\/oauth\/authorize/);
  await page.getByRole("button", { name: "Casey Moreno" }).click();
  await page.waitForURL((url) => url.pathname === EVENT_PATH);
  await expect(
    page.getByRole("heading", { name: "Social Night" }),
  ).toBeVisible();
});

test("a member who isn't an admin is denied an event page and sees no QR code", async ({
  page,
}) => {
  await signInAs(page, "Dante Ruiz");
  await page.goto(EVENT_PATH);
  await expect(page).toHaveURL(/\/admin\/denied\?reason=not_admin$/);
  await expect(
    page.getByRole("heading", { name: "You don't have access" }),
  ).toBeVisible();
  await expect(page.getByRole("img", { name: /QR code/ })).toHaveCount(0);
  await expect(page.getByText("Social Night")).toHaveCount(0);
  await expect(page.getByText("/checkin/ev_tonight")).toHaveCount(0);
});

test("an event TidyHQ doesn't have says so", async ({ page }) => {
  await signInAs(page, "Casey Moreno", "/admin/events/ev_nope");
  await expect(
    page.getByRole("heading", { name: "We couldn't find that event" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "All events" })).toBeVisible();
});

// The attendee list. Social Night starts empty and is open all day in the
// seed; Pub Night is over, with Marcus Bell and Jordan Park in its group.

const REFRESH = 'meta[http-equiv="refresh"]';

test("an admin sees an empty attendee list, refreshing every 30 seconds while check-in is open", async ({
  page,
}) => {
  await signInAs(page, "Casey Moreno", EVENT_PATH);
  await expect(
    page.getByRole("heading", { name: "Checked in (0)" }),
  ).toBeVisible();
  await expect(page.getByText("Nobody has checked in yet")).toBeVisible();
  await expect(page.getByText("Updates every 30 seconds")).toBeVisible();
  await expect(page.locator(REFRESH)).toHaveAttribute("content", "30");
});

test("members who check in show up in the admin's list, by name in alphabetical order", async ({
  page,
}) => {
  for (const member of ["Marcus Bell", "Dante Ruiz"]) {
    await signInAs(page, member, "/checkin/ev_tonight");
    await page.getByRole("button", { name: "Check in" }).click();
    await expect(page.getByText("+1 point")).toBeVisible();
  }
  await signInAs(page, "Casey Moreno", EVENT_PATH);
  await expect(
    page.getByRole("heading", { name: "Checked in (2)" }),
  ).toBeVisible();
  const names = await page.getByRole("listitem").allTextContents();
  expect(names).toEqual(["Dante Ruiz", "Marcus Bell"]);
});

test("the open event page reloads itself and picks up a new check-in, with no clicks", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  await signInAs(page, "Casey Moreno", EVENT_PATH);
  await expect(
    page.getByRole("heading", { name: "Checked in (0)" }),
  ).toBeVisible();

  // A member checks in on their own phone (a separate session).
  const phone = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
  });
  const member = await phone.newPage();
  await signInAs(member, "Dante Ruiz", "/checkin/ev_tonight");
  await member.getByRole("button", { name: "Check in" }).click();
  await expect(member.getByText("+1 point")).toBeVisible();
  await phone.close();

  // No reload from the test: the page's own refresh brings the name in.
  await expect(
    page.getByRole("heading", { name: "Checked in (1)" }),
  ).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText("Dante Ruiz")).toBeVisible();
});

test("a finished event still lists who came, but doesn't refresh", async ({
  page,
}) => {
  await signInAs(page, "Casey Moreno", "/admin/events/ev_pub_night");
  await expect(
    page.getByRole("heading", { name: "Checked in (2)" }),
  ).toBeVisible();
  const names = await page.getByRole("listitem").allTextContents();
  expect(names).toEqual(["Jordan Park", "Marcus Bell"]);
  await expect(page.locator(REFRESH)).toHaveCount(0);
  await expect(page.getByText("Updates every")).toHaveCount(0);
});

test("an event days away doesn't refresh", async ({ page }) => {
  await signInAs(page, "Casey Moreno", "/admin/events/ev_bootblack_social");
  await expect(
    page.getByRole("heading", { name: "Checked in (0)" }),
  ).toBeVisible();
  await expect(page.locator(REFRESH)).toHaveCount(0);
});

test("the attendee list isn't on the printed sheet", async ({ page }) => {
  await signInAs(page, "Casey Moreno", "/admin/events/ev_pub_night");
  await page.emulateMedia({ media: "print" });
  await expect(page.getByText("Jordan Park")).toBeHidden();
  await expect(page.getByRole("heading", { name: "Pub Night" })).toBeVisible();
});

test("a member who isn't an admin never sees who attended, even by asking for the page", async ({
  page,
}) => {
  await signInAs(page, "Dante Ruiz");
  await page.goto("/admin/events/ev_pub_night");
  await expect(page).toHaveURL(/\/admin\/denied\?reason=not_admin$/);
  await expect(page.getByText("Jordan Park")).toHaveCount(0);
  await expect(page.getByText("Marcus Bell")).toHaveCount(0);
  await expect(page.getByText(/Checked in \(/)).toHaveCount(0);
  await expect(page.locator(REFRESH)).toHaveCount(0);
});

test("a signed-out visitor never sees who attended", async ({ page }) => {
  await page.goto("/admin/events/ev_pub_night");
  await expect(page).toHaveURL(/\/mock-tidyhq\/oauth\/authorize/);
  // (The fake sign-in page lists every member by name, so check for the
  // event page's own content instead.)
  await expect(page.getByText(/Checked in \(/)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Pub Night" })).toHaveCount(0);
});

// "Couldn't check admin access" from an event page retries that page. The mock
// can't make TidyHQ fail from a browser, so these open the denied screen with
// the query requireAdmin would have sent.

const RETRY_DENIED = `/admin/denied?reason=unavailable&returnTo=${encodeURIComponent(EVENT_PATH)}`;

test("the 'couldn't check access' screen from an event page goes back to it by itself", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await signInAs(page, "Casey Moreno", "/admin");
  await page.goto(RETRY_DENIED);
  await expect(
    page.getByRole("heading", { name: "Admin access unavailable" }),
  ).toBeVisible();
  await expect(page.getByText("try again in 30 seconds")).toBeVisible();
  await expect(page.locator(REFRESH)).toHaveAttribute(
    "content",
    `30;url=${EVENT_PATH}`,
  );
  // Access is fine this time, so the retry lands on the event page.
  await page.waitForURL((url) => url.pathname === EVENT_PATH, {
    timeout: 45_000,
  });
  await expect(
    page.getByRole("heading", { name: "Social Night" }),
  ).toBeVisible();
});

test("the denied screen won't refresh to a page that isn't an event page", async ({
  page,
}) => {
  await signInAs(page, "Casey Moreno");
  for (const returnTo of ["/admin", "https://evil.example/admin/events/x"]) {
    await page.goto(
      `/admin/denied?reason=unavailable&returnTo=${encodeURIComponent(returnTo)}`,
    );
    await expect(
      page.getByRole("heading", { name: "Admin access unavailable" }),
    ).toBeVisible();
    await expect(page.locator(REFRESH)).toHaveCount(0);
  }
});

test("a member who isn't an admin gets no refresh on the denied screen", async ({
  page,
}) => {
  await signInAs(page, "Dante Ruiz");
  await page.goto(
    `/admin/denied?reason=not_admin&returnTo=${encodeURIComponent(EVENT_PATH)}`,
  );
  await expect(
    page.getByRole("heading", { name: "You don't have access" }),
  ).toBeVisible();
  await expect(page.locator(REFRESH)).toHaveCount(0);
});
