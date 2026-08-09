import type { Page } from "@playwright/test";

export const TEST_PASSWORD = "hunter2hunter2";

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

  await page.goto("/register");
  await page.getByLabel("Name").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByLabel("Confirm password").fill(user.password);
  await page.getByRole("button", { name: "Create account" }).click();

  return user;
}
