import { expect, test } from "@playwright/test";

import { path, registerUser } from "./helpers";

test.describe("route protection", () => {
  test("redirects a signed-out visitor away from the dashboard", async ({ page }) => {
    await page.goto(path("/dashboard"));

    await expect(page).toHaveURL(path("/login"));
  });

  test("redirects a signed-out visitor from /categories to login", async ({ page }) => {
    await page.goto(path("/categories"));
    await expect(page).toHaveURL(new RegExp(`${path("/login")}$`));
  });

  test("redirects a signed-in user away from login", async ({ page }) => {
    await registerUser(page);
    await expect(page).toHaveURL(path("/dashboard"));

    await page.goto(path("/login"));

    await expect(page).toHaveURL(path("/dashboard"));
  });

  test("redirects a signed-in user away from register", async ({ page }) => {
    await registerUser(page);
    await expect(page).toHaveURL(path("/dashboard"));

    await page.goto(path("/register"));

    await expect(page).toHaveURL(path("/dashboard"));
  });

  test("sends a signed-out visitor from the site root to login", async ({ page }) => {
    // `/` redirects to /dashboard, whose own session check bounces to /login.
    await page.goto("/");

    await expect(page).toHaveURL(path("/login"));
  });

  test("sends a signed-in user from the site root to the dashboard", async ({ page }) => {
    await registerUser(page);
    await expect(page).toHaveURL(path("/dashboard"));

    await page.goto("/");

    await expect(page).toHaveURL(path("/dashboard"));
  });

  test("a forged session cookie does not grant access", async ({ page, context }) => {
    // The proxy is optimistic and will let this through. The page's own
    // database check is what must reject it.
    await context.addCookies([
      {
        name: "better-auth.session_token",
        value: "forged-value-that-was-never-issued",
        domain: "localhost",
        path: "/",
      },
    ]);

    await page.goto(path("/dashboard"));

    await expect(page).toHaveURL(path("/login"));
    await expect(page.getByRole("heading", { name: /Signed in/ })).toHaveCount(0);
  });

  test("keeps the dashboard reachable while the session is valid", async ({ page }) => {
    await registerUser(page);
    // registerUser only clicks submit; it does not wait for the async
    // signUp call (and its Set-Cookie response) to finish. Without this
    // wait, the goto below can race ahead of the session cookie existing,
    // same as the other tests in this file that call registerUser.
    await expect(page).toHaveURL(path("/dashboard"));

    await page.goto(path("/dashboard"));
    await expect(page.getByRole("heading", { name: /Signed in/ })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: /Signed in/ })).toBeVisible();
  });

  test("browser back cannot return to an auth form once signed in", async ({ page }) => {
    // Two defences, both exercised here: the forms `replace` rather than
    // `push`, so the finished form leaves no history entry; and any auth page
    // still reachable re-runs its session guard and bounces forward.
    await page.goto(path("/login"));
    await page.getByRole("link", { name: "Sign up" }).click();
    await expect(page).toHaveURL(path("/register"));

    await registerUser(page);
    await expect(page).toHaveURL(path("/dashboard"));

    await page.goBack();

    await expect(page).toHaveURL(path("/dashboard"));
    await expect(page.getByRole("button", { name: "Create account" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Sign in" })).toHaveCount(0);
  });
});
