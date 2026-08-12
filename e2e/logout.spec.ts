import { expect, test } from "@playwright/test";

import { path, registerUser } from "./helpers";

test.describe("logout", () => {
  test("signs out and returns to login", async ({ page }) => {
    await registerUser(page);
    await expect(page).toHaveURL(path("/dashboard"));

    await page.getByRole("button", { name: "Sign out" }).click();

    await expect(page).toHaveURL(path("/login"));
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  });

  test("invalidates the session so the dashboard is no longer reachable", async ({ page }) => {
    await registerUser(page);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(path("/login"));

    await page.goto(path("/dashboard"));

    await expect(page).toHaveURL(path("/login"));
  });

  test("clears the session cookie", async ({ page, context }) => {
    await registerUser(page);
    await expect(page).toHaveURL(path("/dashboard"));

    const before = await context.cookies();
    expect(before.some((cookie) => cookie.name.includes("session_token"))).toBe(true);

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(path("/login"));

    const after = await context.cookies();
    const sessionCookie = after.find((cookie) => cookie.name.includes("session_token"));
    expect(sessionCookie?.value ?? "").toBe("");
  });
});
