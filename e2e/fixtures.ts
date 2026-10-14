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
