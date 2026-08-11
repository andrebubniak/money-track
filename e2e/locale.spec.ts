import { expect, test } from "@playwright/test";

import { path, registerUser } from "./helpers";

test.describe("locale negotiation", () => {
  test("falls back to en-US with no cookie and no header we support", async ({ browser }) => {
    // The default context inherits the host's own Accept-Language, which on
    // an en-US host would match by negotiation rather than by falling back —
    // indistinguishable from this test's actual claim. ja-JP matches none of
    // our three locales, so landing on en-US here can only be the fallback.
    const context = await browser.newContext({ locale: "ja-JP" });
    const page = await context.newPage();

    await page.goto("/dashboard");

    // Unauthenticated, so the proxy's auth gate sends us on to /login.
    await expect(page).toHaveURL("/en-US/login");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();

    await context.close();
  });

  test("negotiates from Accept-Language", async ({ browser }) => {
    const context = await browser.newContext({ locale: "pt-BR" });
    const page = await context.newPage();

    await page.goto("/login");

    await expect(page).toHaveURL("/pt-BR/login");
    await expect(page.getByRole("heading", { name: "Que bom ter você de volta" })).toBeVisible();

    await context.close();
  });

  test("prefers the NEXT_LOCALE cookie over Accept-Language", async ({ browser }) => {
    const context = await browser.newContext({ locale: "pt-BR" });
    await context.addCookies([
      { name: "NEXT_LOCALE", value: "de-DE", url: "http://localhost:3000" },
    ]);
    const page = await context.newPage();

    await page.goto("/login");

    await expect(page).toHaveURL("/de-DE/login");
    await expect(page.getByRole("heading", { name: "Willkommen zurück" })).toBeVisible();

    await context.close();
  });

  test("renders German copy on an explicitly German URL", async ({ page }) => {
    await page.goto("/de-DE/register");

    await expect(page.getByRole("heading", { name: "Konto erstellen" })).toBeVisible();
    await expect(page.getByLabel("Passwort bestätigen")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "de-DE");
  });

  test("coerces an unsupported locale instead of 404ing", async ({ page }) => {
    const response = await page.goto("/fr/dashboard");

    // Unauthenticated, so the pre-existing auth gate carries on to /login —
    // on the coerced URL, not the bogus one.
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL("/en-US/login");
  });

  test("coerces a nonsense locale and keeps the path", async ({ page }) => {
    await page.goto("/abc/dashboard");

    await expect(page).toHaveURL("/en-US/login");
  });

  test("sets html lang to match the URL", async ({ page }) => {
    await page.goto("/pt-BR/login");

    await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
  });

  test("switches locale from the sidebar and remembers the choice", async ({ page }) => {
    await registerUser(page);
    await expect(page).toHaveURL(path("/dashboard"));

    await page.getByRole("button", { name: /language/i }).click();
    await page.getByRole("menuitemradio", { name: "Deutsch" }).click();

    await expect(page).toHaveURL(path("/dashboard", "de-DE"));
    await expect(page.getByRole("button", { name: "Abmelden" })).toBeVisible();

    // The real proof the cookie was written: an unprefixed URL now negotiates
    // to German. Reloading the German URL would prove nothing.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(path("/dashboard", "de-DE"));
  });

  test("coerces an unknown locale for a signed-in visitor", async ({ page }) => {
    await registerUser(page);
    await expect(page).toHaveURL(path("/dashboard"));

    await page.goto("/abc/dashboard");

    await expect(page).toHaveURL(path("/dashboard"));
    await expect(page.getByRole("heading", { name: /Signed in/ })).toBeVisible();
  });
});
