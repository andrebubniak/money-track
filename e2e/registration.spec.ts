import { expect, test } from "@playwright/test";

import { registerUser, TEST_PASSWORD, uniqueEmail } from "./helpers";

test.describe("registration", () => {
  test("creates an account and lands on the dashboard", async ({ page }) => {
    const user = await registerUser(page);

    await expect(page).toHaveURL("/dashboard");
    await expect(page.getByText(`Signed in (${user.name})`)).toBeVisible();
    await expect(page.getByText(user.email)).toBeVisible();
  });

  test("rejects an email that is already registered", async ({ page }) => {
    const email = uniqueEmail("duplicate");
    await registerUser(page, { email });
    await expect(page).toHaveURL("/dashboard");

    // Sign out so the register page is reachable again.
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL("/login");

    await registerUser(page, { email });

    // Scoped to the form: Next.js renders its own <p role="alert"> route
    // announcer (node_modules/next/dist/client/route-announcer.js) on every
    // page, so an unscoped getByRole("alert") always matches two elements.
    await expect(page.locator("form").getByRole("alert")).toHaveText(
      "An account with this email already exists.",
    );
    await expect(page).toHaveURL("/register");
  });

  test("shows field errors and sends no request when empty", async ({ page }) => {
    await page.goto("/register");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByText("Name must be at least 2 characters.")).toBeVisible();
    await expect(page.getByText("Email is required.")).toBeVisible();
    await expect(page.getByText("Password must be at least 8 characters.")).toBeVisible();
    await expect(page.getByText("Please confirm your password.")).toBeVisible();
    await expect(page).toHaveURL("/register");
  });

  test("rejects mismatched password confirmation", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Name").fill("Ana Bubniak");
    await page.getByLabel("Email").fill(uniqueEmail());
    await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
    await page.getByLabel("Confirm password").fill("something-else");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByText("Passwords don't match.")).toBeVisible();
    await expect(page).toHaveURL("/register");
  });

  test("stores the email lowercased", async ({ page }) => {
    const email = uniqueEmail("MixedCase").toUpperCase();
    await registerUser(page, { email });

    await expect(page).toHaveURL("/dashboard");
    await expect(page.getByText(email.toLowerCase())).toBeVisible();
  });
});
