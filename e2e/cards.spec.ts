import { expect, type Page, test } from "@playwright/test";

import { path, registerUser } from "./helpers";

/** The table's "Name" column, top to bottom. */
async function cardNameColumn(page: Page, expectedCount: number): Promise<string[]> {
  const rows = page.locator("table tbody tr");
  await expect(rows).toHaveCount(expectedCount);
  return rows.locator("td:nth-child(1)").allInnerTexts();
}

/** The row whose Name cell is (or contains) `name` — unique for every name used below. */
function cardRow(page: Page, name: string) {
  return page.locator("table tbody tr").filter({ hasText: name });
}

test.describe("cards", () => {
  test("shows an empty state with no cards on first visit", async ({ page }) => {
    await registerUser(page);
    // registerUser only clicks submit; it does not wait for the async
    // signUp call (and its Set-Cookie response) to finish — see the same
    // wait in e2e/route-protection.spec.ts. Without it, the goto below can
    // race ahead of the session cookie existing and bounce to /login.
    await expect(page).toHaveURL(path("/dashboard"));

    await page.goto(path("/cards"));

    await expect(page.getByText("You don't have any cards yet.")).toBeVisible();
  });

  test("creating a card adds it to the list with the selected type", async ({ page }) => {
    await registerUser(page);
    await expect(page).toHaveURL(path("/dashboard"));

    await page.goto(path("/cards/new"));
    await page.getByRole("textbox", { name: "Name", exact: true }).fill("Personal Visa");
    await page.getByRole("radio", { name: "Credit" }).click();
    await page.getByRole("button", { name: "Create card" }).click();

    await expect(page).toHaveURL(path("/cards"));

    const names = await cardNameColumn(page, 1);
    expect(names).toEqual(["Personal Visa"]);
    await expect(cardRow(page, "Personal Visa")).toContainText("Credit");
  });

  test("editing a card's name and type persists across a reload", async ({ page }) => {
    await registerUser(page);
    await expect(page).toHaveURL(path("/dashboard"));

    await page.goto(path("/cards/new"));
    await page.getByRole("textbox", { name: "Name", exact: true }).fill("Personal Visa");
    await page.getByRole("radio", { name: "Debit" }).click();
    await page.getByRole("button", { name: "Create card" }).click();
    await expect(page).toHaveURL(path("/cards"));

    // Actions live behind the row's ellipsis-vertical menu, not a direct link.
    await cardRow(page, "Personal Visa").getByRole("button", { name: "Actions" }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await expect(page).toHaveURL(/\/cards\/.+\/edit$/);

    const nameField = page.getByRole("textbox", { name: "Name", exact: true });
    await expect(nameField).toHaveValue("Personal Visa");
    await expect(page.getByRole("radio", { name: "Debit" })).toBeChecked();

    await nameField.fill("Business Visa");
    await page.getByRole("radio", { name: "Credit" }).click();
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page).toHaveURL(path("/cards"));
    await expect(cardRow(page, "Business Visa")).toContainText("Credit");

    // Proves the server actually persisted the write, not just that the
    // client-side transition re-rendered with the value still in memory.
    await page.reload();
    await expect(cardRow(page, "Business Visa")).toContainText("Credit");
  });

  test("deleting a card through the confirm dialog removes only that row", async ({ page }) => {
    await registerUser(page);
    await expect(page).toHaveURL(path("/dashboard"));

    await page.goto(path("/cards/new"));
    await page.getByRole("textbox", { name: "Name", exact: true }).fill("Card One");
    await page.getByRole("radio", { name: "Debit" }).click();
    await page.getByRole("button", { name: "Create card" }).click();
    await expect(page).toHaveURL(path("/cards"));

    await page.goto(path("/cards/new"));
    await page.getByRole("textbox", { name: "Name", exact: true }).fill("Card Two");
    await page.getByRole("radio", { name: "Credit" }).click();
    await page.getByRole("button", { name: "Create card" }).click();
    await expect(page).toHaveURL(path("/cards"));

    await cardNameColumn(page, 2);

    await cardRow(page, "Card One").getByRole("button", { name: "Actions" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Delete" }).click();
    await expect(dialog).toBeHidden();

    // The count check is the point: proves "Card Two" survived, not merely
    // that "Card One" is gone.
    const after = await cardNameColumn(page, 1);
    expect(after).toEqual(["Card Two"]);
  });

  test("disables creation at the 50-card cap and refuses a 51st", async ({ page }) => {
    // 50 form round-trips against a real dev server comfortably exceeds the
    // default 30s test timeout.
    test.setTimeout(180_000);

    await registerUser(page);
    await expect(page).toHaveURL(path("/dashboard"));

    // No presets for cards (unlike categories' 11) — create all 50 from zero.
    for (let i = 1; i <= 50; i++) {
      await page.goto(path("/cards/new"));
      await page.getByRole("textbox", { name: "Name", exact: true }).fill(`Cap card ${i}`);
      await page.getByRole("radio", { name: "Debit" }).click();
      await page.getByRole("button", { name: "Create card" }).click();
      await expect(page).toHaveURL(path("/cards"));
    }

    await cardNameColumn(page, 50);

    // The list page's own gate: disabled, not hidden, with the limit copy —
    // see the `atLimit` branch in cards/page.tsx.
    await expect(page.getByRole("button", { name: "New card" })).toBeDisabled();
    await expect(page.getByRole("link", { name: "New card" })).toHaveCount(0);
    await expect(page.getByText("You've reached the limit of 50 cards.")).toBeVisible();

    // The list page's gate is only a convenience; `createCard` re-checks the
    // cap server-side regardless of how the form was reached.
    await page.goto(path("/cards/new"));
    await page.getByRole("textbox", { name: "Name", exact: true }).fill("Card number 51");
    await page.getByRole("radio", { name: "Credit" }).click();
    await page.getByRole("button", { name: "Create card" }).click();

    await expect(page.locator("form").getByRole("alert")).toHaveText(
      "You've reached the limit of 50 cards.",
    );
    await expect(page).toHaveURL(path("/cards/new"));

    await page.goto(path("/cards"));
    await cardNameColumn(page, 50);
  });
});
