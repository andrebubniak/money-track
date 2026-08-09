import { expect, test } from "@playwright/test";

import { registerUser, TEST_PASSWORD, uniqueEmail } from "./helpers";

test.describe("login", () => {
  test("signs in an existing account", async ({ page }) => {
    const user = await registerUser(page);
    await expect(page).toHaveURL("/dashboard");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL("/login");

    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill(user.password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL("/dashboard");
    // Scoped to the heading role, not getByText: the dashboard heading is a
    // real <h1>, and Next's app-router announcer mirrors that exact text into
    // its own role="alert" node on client-side navigation (see the identical
    // note in registration.spec.ts). An unscoped getByText would match both.
    await expect(page.getByRole("heading", { name: `Signed in (${user.name})` })).toBeVisible();
  });

  test("rejects a wrong password", async ({ page }) => {
    const user = await registerUser(page);
    await page.getByRole("button", { name: "Sign out" }).click();

    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill("definitely-not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.locator("form").getByRole("alert")).toHaveText("Incorrect email or password.");
    await expect(page).toHaveURL("/login");
  });

  test("gives an unknown email the identical message", async ({ page }) => {
    // The two failures must be indistinguishable, or the form becomes an
    // oracle for which addresses have accounts.
    await page.goto("/login");
    await page.getByLabel("Email").fill(uniqueEmail("never-registered"));
    await page.getByLabel("Password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.locator("form").getByRole("alert")).toHaveText("Incorrect email or password.");
  });

  test("validates the email format before submitting", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
    await expect(page.locator("form").getByRole("alert")).toHaveCount(0);
  });

  test("accepts the email in a different case", async ({ page }) => {
    const user = await registerUser(page);
    await page.getByRole("button", { name: "Sign out" }).click();

    await page.getByLabel("Email").fill(user.email.toUpperCase());
    await page.getByLabel("Password").fill(user.password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL("/dashboard");
  });
});
