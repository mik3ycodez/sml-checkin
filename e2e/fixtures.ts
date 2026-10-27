import { expect, test as base, type Page } from "@playwright/test";

/** `test` with the mock TidyHQ reset to its seed before every test. */
export const test = base.extend<{ resetMock: void }>({
  resetMock: [
    async ({ request }, use) => {
      const response = await request.post("/mock-tidyhq/reset");
      expect(response.status()).toBe(204);
      await use();
    },
    { auto: true },
  ],
});

export { expect };

/**
 * Signs in through the fake TidyHQ page by picking a seed member by name,
 * then lands on `returnTo`.
 */
export async function signInAs(page: Page, name: string, returnTo = "/") {
  await page.goto(`/auth/signin?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByRole("button", { name }).click();
  await page.waitForURL((url) => url.pathname === returnTo);
}

/** Opens the header's account menu (a native disclosure, so no script needed). */
export async function openMenu(page: Page) {
  await page.locator("summary").click();
}

/** Signs out through the header's account menu. */
export async function signOut(page: Page) {
  await openMenu(page);
  await page.getByRole("button", { name: "Sign out" }).click();
}
