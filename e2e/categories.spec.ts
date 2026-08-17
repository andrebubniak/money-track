import { expect, type Page, test } from "@playwright/test";

import deDE from "../messages/de-DE.json";
import enUS from "../messages/en-US.json";

import { path, registerUser } from "./helpers";

/**
 * The 11 seeded presets' English display names (see
 * `src/lib/category-presets.ts` and `messages/en-US.json`'s
 * `categories.presets`), already in the order the list page is expected to
 * render them: alphabetically, by the *translated* name — see the sorting
 * comment in `src/app/[locale]/categories/page.tsx`.
 */
const PRESET_NAMES_SORTED = [
  "Education",
  "Entertainment",
  "Food",
  "Gifts and donations",
  "Health and personal care",
  "Housing",
  "Savings and investments",
  "Shopping",
  "Transportation",
  "Travel",
  "Utilities",
];

function sorted(names: string[]): string[] {
  return [...names].sort((a, b) => a.localeCompare(b, "en-US"));
}

/**
 * The same 11 preset keys, used to build the German expectations below from
 * the actual catalogs rather than hardcoding translated strings — mirroring
 * how `PRESET_NAMES_SORTED` above stands in for the English catalog, so a
 * changed translation can't silently desync this test.
 */
const PRESET_KEYS = Object.keys(deDE.categories.presets) as (keyof typeof deDE.categories.presets)[];

/** Preset keys ordered by their *German* translated name, German collation. */
const GERMAN_PRESET_KEY_ORDER = [...PRESET_KEYS].sort((a, b) =>
  new Intl.Collator("de-DE").compare(deDE.categories.presets[a].name, deDE.categories.presets[b].name),
);

/** The same keys ordered by their *English* translated name, for comparison. */
const ENGLISH_PRESET_KEY_ORDER = [...PRESET_KEYS].sort((a, b) =>
  enUS.categories.presets[a].name.localeCompare(enUS.categories.presets[b].name, "en-US"),
);

/** The German preset names, in the order the list page is expected to render them. */
const GERMAN_PRESET_NAMES_SORTED = GERMAN_PRESET_KEY_ORDER.map((key) => deDE.categories.presets[key].name);

/**
 * The table's "Name" column, top to bottom.
 *
 * `categories/loading.tsx` renders its own 5-row skeleton table
 * (see that file) while the real rows are being fetched, and a client-side
 * transition (create/edit/delete all end with a `revalidatePath`) can
 * briefly show it again too. Asserting the row count first — always a
 * value the skeleton's fixed 5 rows won't accidentally satisfy here — is
 * what makes this wait past the skeleton instead of reading it.
 */
async function categoryNameColumn(page: Page, expectedCount: number): Promise<string[]> {
  const rows = page.locator("table tbody tr");
  await expect(rows).toHaveCount(expectedCount);
  return rows.locator("td:nth-child(2)").allInnerTexts();
}

/** The row whose Name cell is (or contains) `name` — unique for every name used below. */
function categoryRow(page: Page, name: string) {
  return page.locator("table tbody tr").filter({ hasText: name });
}

test.describe("categories", () => {
  test("shows the 11 presets sorted alphabetically on first visit", async ({ page }) => {
    await registerUser(page);
    // registerUser only clicks submit; it does not wait for the async
    // signUp call (and its Set-Cookie response) to finish — see the same
    // wait in e2e/route-protection.spec.ts. Without it, the goto below can
    // race ahead of the session cookie existing and bounce to /login.
    await expect(page).toHaveURL(path("/dashboard"));

    await page.goto(path("/categories"));

    const names = await categoryNameColumn(page, 11);
    expect(names).toEqual(PRESET_NAMES_SORTED);
  });

  test("shows the 11 presets translated and sorted in German collation order", async ({ page }) => {
    // en-US alone can't tell "translation resolved correctly" apart from
    // "translation never happened; the raw English fallback columns were
    // rendered as-is" — the two are byte-identical in that locale (see the
    // comment on `resolveCategoryDisplay` in src/lib/category-display.ts).
    // Visiting in de-DE, and asserting against the German catalog rather than
    // hardcoded strings, closes that gap.
    await registerUser(page);
    await expect(page).toHaveURL(path("/dashboard"));

    await page.goto(path("/categories", "de-DE"));

    const names = await categoryNameColumn(page, 11);
    expect(names).toEqual(GERMAN_PRESET_NAMES_SORTED);

    // The same 11 categories, identified by key, sort into a different
    // relative order in German than in English — proof the sort key is the
    // translated text, not a coincidence that would also hold for the raw
    // English fallback columns.
    expect(GERMAN_PRESET_KEY_ORDER).not.toEqual(ENGLISH_PRESET_KEY_ORDER);
  });

  test("creating a category inserts it in sorted position among the presets", async ({ page }) => {
    await registerUser(page);
    await expect(page).toHaveURL(path("/dashboard"));

    await page.goto(path("/categories/new"));
    const newName = "Gadgets and Gizmos";
    await page.getByRole("textbox", { name: "Name", exact: true }).fill(newName);
    await page.getByRole("button", { name: "Create category" }).click();

    await expect(page).toHaveURL(path("/categories"));

    const names = await categoryNameColumn(page, 12);
    expect(names).toEqual(sorted([...PRESET_NAMES_SORTED, newName]));
    // Sits between "Food" and "Gifts and donations" — not first, not last —
    // so this actually exercises mid-list insertion, not just append/prepend.
    expect(names.indexOf(newName)).toBe(3);
  });

  test("editing a preset's name persists across a reload and moves it in the table", async ({
    page,
  }) => {
    await registerUser(page);
    await expect(page).toHaveURL(path("/dashboard"));
    await page.goto(path("/categories"));
    await categoryNameColumn(page, 11);

    // Actions live behind the row's ellipsis-vertical menu, not a direct link.
    await categoryRow(page, "Housing").getByRole("button", { name: "Actions" }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await expect(page).toHaveURL(/\/categories\/.+\/edit$/);

    const nameField = page.getByRole("textbox", { name: "Name", exact: true });
    await expect(nameField).toHaveValue("Housing");

    const newName = "Household Costs";
    await nameField.fill(newName);
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page).toHaveURL(path("/categories"));

    const expected = sorted([
      ...PRESET_NAMES_SORTED.filter((name) => name !== "Housing"),
      newName,
    ]);
    expect(await categoryNameColumn(page, 11)).toEqual(expected);

    // Proves the server actually persisted the write, not just that the
    // client-side transition re-rendered with the value still in memory.
    await page.reload();
    expect(await categoryNameColumn(page, 11)).toEqual(expected);
  });

  test("deleting a category through the confirm dialog removes only that row", async ({
    page,
  }) => {
    await registerUser(page);
    await expect(page).toHaveURL(path("/dashboard"));
    await page.goto(path("/categories"));

    const before = await categoryNameColumn(page, 11);

    // Actions live behind the row's ellipsis-vertical menu, not a direct button.
    await categoryRow(page, "Utilities").getByRole("button", { name: "Actions" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Delete" }).click();
    await expect(dialog).toBeHidden();

    // The count check is the point: proves the other 10 presets survived,
    // not merely that "Utilities" is gone (a bug that dropped two rows would
    // still pass a bare `not.toContain`).
    const after = await categoryNameColumn(page, 10);
    expect(after).toEqual(before.filter((name) => name !== "Utilities"));
  });

  test("disables creation at the 50-category cap and refuses a 51st", async ({ page }) => {
    // ~40 form round-trips against a real dev server comfortably exceeds the
    // default 30s test timeout.
    test.setTimeout(180_000);

    await registerUser(page);
    await expect(page).toHaveURL(path("/dashboard"));

    // 11 presets already exist; create 39 more to land exactly on the cap.
    for (let i = 1; i <= 39; i++) {
      await page.goto(path("/categories/new"));
      await page.getByRole("textbox", { name: "Name", exact: true }).fill(`Cap category ${i}`);
      await page.getByRole("button", { name: "Create category" }).click();
      await expect(page).toHaveURL(path("/categories"));
    }

    await categoryNameColumn(page, 50);

    // The list page's own gate: disabled, not hidden, with the limit copy —
    // see the `atLimit` branch in categories/page.tsx.
    await expect(page.getByRole("button", { name: "New category" })).toBeDisabled();
    await expect(page.getByRole("link", { name: "New category" })).toHaveCount(0);
    await expect(page.getByText("You've reached the limit of 50 categories.")).toBeVisible();

    // The list page's gate is only a convenience; `createCategory` re-checks
    // the cap server-side regardless of how the form was reached.
    await page.goto(path("/categories/new"));
    await page.getByRole("textbox", { name: "Name", exact: true }).fill("Category number 51");
    await page.getByRole("button", { name: "Create category" }).click();

    await expect(page.locator("form").getByRole("alert")).toHaveText(
      "You've reached the limit of 50 categories.",
    );
    await expect(page).toHaveURL(path("/categories/new"));

    await page.goto(path("/categories"));
    await categoryNameColumn(page, 50);
  });
});
