import type { Page } from "@playwright/test";
import { expect, openMenu, signInAs, test } from "./fixtures";

// The theme switch is a plain form post, so this runs in all three projects,
// JavaScript off too. Colors are the tokens in globals.css.
const DARK_BACKGROUND = "rgb(10, 10, 10)";
const LIGHT_BACKGROUND = "rgb(255, 255, 255)";

async function pick(page: Page, theme: "System" | "Light" | "Dark") {
  await openMenu(page);
  await page.getByRole("button", { name: theme, exact: true }).click();
}

const themeColors = (page: Page) =>
  page
    .locator('head meta[name="theme-color"]')
    .evaluateAll((metas: Element[]) =>
      metas.map((m: Element) => [
        m.getAttribute("content"),
        m.getAttribute("media"),
      ]),
    );

test("picking Dark on /me stays there and darkens the page, the logo and the menu", async ({
  page,
}) => {
  await signInAs(page, "Dante Ruiz", "/me");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    LIGHT_BACKGROUND,
  );
  await expect(page.locator("header img.logo-for-light")).toBeVisible();

  await pick(page, "Dark");
  await expect(page).toHaveURL(/\/me$/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    DARK_BACKGROUND,
  );
  await expect(page.locator("header img.logo-for-dark")).toBeVisible();
  await expect(page.locator("header img.logo-for-light")).toBeHidden();

  await openMenu(page);
  await expect(page.getByRole("button", { name: "Dark" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "System" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  // Paper stays white: print forces the light colors even in a dark theme.
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("body")).toHaveCSS("color", "rgb(23, 23, 23)");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    LIGHT_BACKGROUND,
  );
});

test("System goes back to following the device", async ({ page }) => {
  await signInAs(page, "Dante Ruiz", "/me");
  await page.emulateMedia({ colorScheme: "light" });
  await pick(page, "Dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await pick(page, "System");
  await expect(page).toHaveURL(/\/me$/);
  await expect(page.locator("html")).not.toHaveAttribute("data-theme");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    LIGHT_BACKGROUND,
  );
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    DARK_BACKGROUND,
  );
  expect(await themeColors(page)).toEqual([
    ["#ffffff", "(prefers-color-scheme: light)"],
    ["#171717", "(prefers-color-scheme: dark)"],
  ]);
});

test("Light on a dark device returns to the same check-in page, with a light browser bar", async ({
  page,
}) => {
  await signInAs(page, "Dante Ruiz", "/checkin/ev_tonight");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    DARK_BACKGROUND,
  );

  await pick(page, "Light");
  // Not the sign-out rule: this is the page the member was on, still signed in.
  await expect(page).toHaveURL(/\/checkin\/ev_tonight$/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    LIGHT_BACKGROUND,
  );
  await expect(page.locator("header img.logo-for-light")).toBeVisible();
  await expect(page.locator("header img.logo-for-dark")).toBeHidden();
  expect(await themeColors(page)).toEqual([["#ffffff", null]]);
  await expect(
    page.getByLabel("Account menu, signed in as Dante Ruiz"),
  ).toBeVisible();
});

// With JavaScript on, the Check in button is a server action that redirects
// without re-rendering the layout, so the header still thinks it is on the
// page before. The theme post must go back to where the browser really is.
test("picking Dark on the check-in result screen stays on it", async ({
  page,
  javaScriptEnabled,
}) => {
  test.skip(!javaScriptEnabled, "the stale header needs a soft navigation");
  await signInAs(page, "Dante Ruiz", "/checkin/ev_tonight");
  await page.getByRole("button", { name: "Check in" }).click();
  await expect(
    page.getByRole("heading", { name: "You're checked in, Dante Ruiz!" }),
  ).toBeVisible();
  const resultUrl = page.url();

  await pick(page, "Dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page).toHaveURL(resultUrl);
  await expect(
    page.getByRole("heading", { name: "You're checked in, Dante Ruiz!" }),
  ).toBeVisible();
  await expect(page.getByText("+1 point")).toBeVisible();
});

test("signed out, the theme is reachable from / and sticks through sign-in", async ({
  page,
}) => {
  await page.goto("/");
  await page.emulateMedia({ colorScheme: "light" });
  await pick(page, "Dark");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await themeColors(page)).toEqual([["#171717", null]]);

  await signInAs(page, "Dante Ruiz", "/me");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
