import { expect, test } from "@playwright/test";

import { path } from "./helpers";

// This suite verifies our half of the OAuth handshake only. It deliberately
// stops at Google's door: Google blocks automated browsers, so completing the
// consent flow here would be flaky rather than informative. The full round
// trip, and the account-linking behaviour that follows it, stay on the manual
// checklist in the spec.
test.describe("google sign-in", () => {
  test("sends the browser to Google with the right parameters", async ({ page }) => {
    await page.goto(path("/login"));

    await page.getByRole("button", { name: "Continue with Google" }).click();
    await page.waitForURL(/accounts\.google\.com/, { timeout: 20_000 });

    const url = new URL(page.url());
    expect(url.hostname).toBe("accounts.google.com");
    expect(url.searchParams.get("client_id")).toBeTruthy();
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/auth/callback/google",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toContain("email");
  });

  test("offers the same Google entry point on register", async ({ page }) => {
    await page.goto(path("/register"));

    await page.getByRole("button", { name: "Continue with Google" }).click();
    await page.waitForURL(/accounts\.google\.com/, { timeout: 20_000 });

    expect(new URL(page.url()).hostname).toBe("accounts.google.com");
  });
});
