import { expect, type Page } from "@playwright/test";

export const TEST_PASSWORD = "Hunter2hunter2";

export const DEFAULT_LOCALE = "en-US";

/**
 * Builds a locale-prefixed path. Every in-app URL carries its locale
 * (`localePrefix: "always"`), so a bare `/login` only ever arrives as a
 * redirect — asserting on it would be asserting on the redirect, not the page.
 */
export function path(route: string, locale = DEFAULT_LOCALE): string {
  return `/${locale}${route}`;
}

let counter = 0;

/**
 * Unique per call, so repeated runs never collide. The counter is
 * process-local; the suite runs single-worker (`workers: 1`), so that is
 * sufficient today. Add `process.pid` before enabling parallel workers.
 */
export function uniqueEmail(prefix = "user"): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}@moneytrack.test`;
}

export async function registerUser(
  page: Page,
  overrides: Partial<{ name: string; email: string; password: string }> = {},
) {
  const user = {
    name: overrides.name ?? "Ana Bubniak",
    email: overrides.email ?? uniqueEmail(),
    password: overrides.password ?? TEST_PASSWORD,
  };

  await page.goto(path("/register"));
  await page.getByLabel("Name").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByLabel("Confirm password").fill(user.password);
  await page.getByRole("button", { name: "Create account" }).click();

  return user;
}

/**
 * Creates a category through the real form and waits for the redirect back
 * to the list — every transactions scenario needs at least one category to
 * reference, and neither `cards.spec.ts` nor `categories.spec.ts` exports a
 * reusable helper for it (they only ever create one inline, once per test).
 */
export async function createCategory(page: Page, name: string): Promise<void> {
  await page.goto(path("/categories/new"));
  await page.getByRole("textbox", { name: "Name", exact: true }).fill(name);
  await page.getByRole("button", { name: "Create category" }).click();
  await expect(page).toHaveURL(path("/categories"));
}

/** Same as `createCategory`, for cards. */
export async function createCard(
  page: Page,
  name: string,
  type: "Debit" | "Credit" = "Debit",
): Promise<void> {
  await page.goto(path("/cards/new"));
  await page.getByRole("textbox", { name: "Name", exact: true }).fill(name);
  await page.getByRole("radio", { name: type }).click();
  await page.getByRole("button", { name: "Create card" }).click();
  await expect(page).toHaveURL(path("/cards"));
}
