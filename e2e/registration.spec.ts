import { expect, test } from "@playwright/test";

import { registerUser, TEST_PASSWORD, uniqueEmail } from "./helpers";

test.describe("registration", () => {
  test("creates an account and lands on the dashboard", async ({ page }) => {
    const user = await registerUser(page);

    await expect(page).toHaveURL("/dashboard");
    // Scoped to the heading role, not getByText: the dashboard heading is now
    // a real <h1> (see src/app/dashboard/page.tsx), and Next's app-router
    // announcer (node_modules/next/dist/client/components/app-router-announcer.js)
    // mirrors that exact text into its own role="alert" node on client-side
    // navigation. An unscoped getByText would match both.
    await expect(page.getByRole("heading", { name: `Signed in (${user.name})` })).toBeVisible();
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

  // Named for what it actually checks. Proving no network request was sent
  // belongs at the unit level, where register-form.spec.tsx already asserts
  // signUpEmail was not called.
  test("shows field errors and stays put when empty", async ({ page }) => {
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
    // `exact: true` is load-bearing. Playwright's getByText defaults to
    // case-INSENSITIVE substring matching, which would match the uppercase
    // email too — making this assertion pass whether or not normalisation
    // happens, i.e. testing nothing.
    await expect(
      page.getByText(email.toLowerCase(), { exact: true }),
    ).toBeVisible();
  });

  test("rejects a weak password posted straight to the API", async ({ request }) => {
    // The browser is not a trust boundary. This skips the form entirely, the
    // way an attacker or a stray script would. better-auth's own body schema
    // would accept this; the `before` hook in src/lib/auth.ts is what stops it.
    const email = uniqueEmail("bypass-password");

    const rejected = await request.post("/api/auth/sign-up/email", {
      data: { name: "Ana Bubniak", email, password: "nouppercaseordigit" },
    });

    expect(rejected.status()).toBe(400);
    expect((await rejected.json()).code).toBe("PASSWORD_DOES_NOT_MEET_REQUIREMENTS");

    // Nothing was written: the same address is still free.
    const accepted = await request.post("/api/auth/sign-up/email", {
      data: { name: "Ana Bubniak", email, password: TEST_PASSWORD },
    });
    expect(accepted.status()).toBe(200);
  });

  test("rejects an over-long name posted straight to the API", async ({ request }) => {
    // better-auth types `name` as an unbounded z.string(), so without the hook
    // this would write a 5000-character name to the database.
    const rejected = await request.post("/api/auth/sign-up/email", {
      data: { name: "a".repeat(5000), email: uniqueEmail("bypass-name"), password: TEST_PASSWORD },
    });

    expect(rejected.status()).toBe(400);
    expect((await rejected.json()).code).toBe("INVALID_NAME");
  });
});
