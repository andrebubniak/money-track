import { expect, type Page, test } from "@playwright/test";

import {
  closeDb,
  dbQuery,
  getCardIdByName,
  getCategoryIdByName,
  getUserIdByEmail,
  insertRecurringTransaction,
  insertTransaction,
} from "./db";
import { createCard, createCategory, path, registerUser, uniqueEmail } from "./helpers";

/**
 * The whole feature end to end: a real database, real Server Actions, and
 * real rendered pages — the only layer where these three ever run together.
 * Everything under this suite (action specs, component specs) mocks at
 * least one of them.
 */

// ---------------------------------------------------------------------------
// Shared locators and setup helpers
// ---------------------------------------------------------------------------

/** Every row in the transactions table. */
function transactionRows(page: Page) {
  return page.locator("table tbody tr");
}

/** The row whose Description cell is (or contains) `text` — unique for every description used below. */
function transactionRow(page: Page, text: string) {
  return page.locator("table tbody tr").filter({ hasText: text });
}

/**
 * Opens an `AsyncCombobox` by its label and clicks the matching `option` out
 * of whatever the *unfiltered* first page already shows — deliberately never
 * types into it. Two independent, confirmed `AsyncCombobox` bugs rule out
 * typing:
 *
 * 1. Resolving the field's `id` through one accessible-name query up front
 *    and driving the click through that stable id, not a second `getByRole`
 *    call, is load-bearing: Base UI's Combobox
 *    (`node_modules/@base-ui/react/floating-ui-react/utils/markOthers.js`)
 *    marks background content `aria-hidden="true"` for as long as its popup
 *    is open, and "background" includes this field's own
 *    `<Label htmlFor="categoryId">` — the *only* thing giving the input its
 *    accessible name, since neither `AsyncCombobox` nor its callers pass an
 *    `aria-label`. A second `getByRole("combobox", { name: "Category" })`
 *    once the popup is open resolves to nothing and hangs until timeout.
 * 2. Typing is *itself* broken the moment the field already has a value —
 *    confirmed by hand: on the filters panel (whose category/card fields
 *    start on the `allOptionLabel` "All" entry) every keystroke was
 *    overwritten back to "All" within the same render, and retyping over an
 *    already-selected *real* category on an edit form left the field blank
 *    instead. A fresh, never-selected field (every create-form combobox on
 *    first use) is unaffected — only re-typing over an existing selection
 *    reproduces it — but the safest, uniformly-correct move is to never rely
 *    on typing at all. Confirmed safe: clicking a *different* option outright
 *    (no typing) works fine even starting from "All". Filed as a real,
 *    user-facing `AsyncCombobox` bug in the task report rather than silently
 *    worked around here without saying so.
 *
 * This is why every category/card name this suite creates is chosen to sort
 * within `OPTIONS_PAGE_SIZE` (10, `src/lib/options.ts`) of the 11 seeded
 * presets — the unfiltered first page has to already contain the option.
 */
async function selectCombobox(page: Page, label: string, optionText: string): Promise<void> {
  const trigger = page.getByRole("combobox", { name: label, exact: true });
  const id = await trigger.getAttribute("id");
  if (!id) throw new Error(`AsyncCombobox labeled "${label}" has no id`);
  await page.locator(`#${id}`).click();
  await page.getByRole("option", { name: optionText, exact: true }).click();
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function ordinal(day: number): string {
  const remainder10 = day % 10;
  const remainder100 = day % 100;
  if (remainder10 === 1 && remainder100 !== 11) return `${day}st`;
  if (remainder10 === 2 && remainder100 !== 12) return `${day}nd`;
  if (remainder10 === 3 && remainder100 !== 13) return `${day}rd`;
  return `${day}th`;
}

/**
 * react-day-picker's default day-button accessible name is the full
 * formatted date ("Thursday, August 20th, 2026"), not the bare day number —
 * see `src/components/ui/date-picker.spec.tsx`'s comment on the same thing.
 * Built from the browser's own locale (en-US, same as the unit test), which
 * only matters because it has to agree with whatever the real Chromium
 * instance renders.
 */
function dayButtonNameRegex(date: Date): RegExp {
  const month = MONTH_NAMES[date.getMonth()];
  const day = ordinal(date.getDate());
  const year = date.getFullYear();
  return new RegExp(`${month} ${day}, ${year}`);
}

/**
 * Opens a `DatePicker` by its trigger's accessible name and clicks the given
 * day. Only ever called for a day within the currently displayed month —
 * `DatePicker` opens on the month of its current value (today, for every
 * create form), and every date this suite picks stays inside that same
 * month, so no "previous month" navigation is needed.
 */
async function pickDate(page: Page, triggerLabel: string, date: Date): Promise<void> {
  await page.getByRole("button", { name: triggerLabel, exact: true }).click();
  await page.getByRole("button", { name: dayButtonNameRegex(date) }).click();
}

function isoDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function todayIso(): string {
  return isoDate(new Date());
}

/** Matches `formatDate`'s `MDY` output — the default `dateFormat` for a freshly registered user. */
function mdyLabel(date: Date): string {
  const [year, month, day] = isoDate(date).split("-");
  return `${month}/${day}/${year}`;
}

/**
 * The filters panel's Collapsible has no `defaultOpen`, so it starts closed,
 * but its open/closed state (and the `draft` state inside it) survives the
 * soft navigation `Apply` triggers — same pathname, only the search params
 * change. Toggling blindly a second time would close it instead of opening
 * it. Checking first is what makes this safe regardless of what state the
 * previous step left it in.
 */
async function ensureFiltersOpen(page: Page): Promise<void> {
  const clear = page.getByRole("button", { name: "Clear", exact: true });
  if (!(await clear.isVisible())) {
    await page.getByRole("button", { name: "Filters" }).click();
    await expect(clear).toBeVisible();
  }
}

/** A window wide enough to contain any date this suite creates, for scenarios that need every row visible regardless of when it falls. */
const WIDE_FROM = "2000-01-01";
const WIDE_TO = "2100-12-31";

type OneOffOptions = {
  type?: "Income" | "Expense";
  amount: string;
  category: string;
  card?: string | null;
  description?: string;
  /** Days before today. 0 (the default) leaves the form's own default (today) untouched. */
  daysAgo?: number;
  isPaid?: boolean;
};

/** Fills and submits the one-off transaction form, and waits for the redirect back to the list. */
async function createOneOffTransaction(page: Page, options: OneOffOptions): Promise<void> {
  await page.goto(path("/transactions/new"));

  if (options.type === "Income") {
    await page.getByRole("radio", { name: "Income" }).click();
  }

  await page.getByRole("spinbutton", { name: "Amount", exact: true }).fill(options.amount);
  await selectCombobox(page, "Category", options.category);
  if (options.card) await selectCombobox(page, "Card", options.card);
  if (options.daysAgo) await pickDate(page, "Date", daysAgo(options.daysAgo));
  if (options.description) {
    await page.getByRole("textbox", { name: "Description", exact: true }).fill(options.description);
  }
  if (options.isPaid) {
    await page.getByRole("checkbox", { name: "Already paid" }).click();
  }

  await page.getByRole("button", { name: "Create transaction" }).click();
  await expect(page).toHaveURL(path("/transactions"));
}

type RecurringOptions = {
  type?: "Income" | "Expense";
  amount: string;
  category: string;
  card?: string | null;
  description?: string;
};

/** Fills and submits the recurring (ongoing) transaction form. */
async function createRecurring(page: Page, options: RecurringOptions): Promise<void> {
  await page.goto(path("/transactions/recurring/new"));

  if (options.type === "Income") {
    await page.getByRole("radio", { name: "Income" }).click();
  }

  await page.getByRole("spinbutton", { name: "Amount", exact: true }).fill(options.amount);
  await selectCombobox(page, "Category", options.category);
  if (options.card) await selectCombobox(page, "Card", options.card);
  if (options.description) {
    await page.getByRole("textbox", { name: "Description", exact: true }).fill(options.description);
  }

  await page.getByRole("button", { name: "Create transaction" }).click();
  await expect(page).toHaveURL(path("/transactions"));
}

type InstallmentOptions = {
  type?: "Income" | "Expense";
  amount: string;
  category: string;
  card?: string | null;
  description?: string;
  occurrencesCount: number;
};

/** Fills and submits the installment plan form. */
async function createInstallmentPlan(page: Page, options: InstallmentOptions): Promise<void> {
  await page.goto(path("/transactions/installments/new"));

  if (options.type === "Income") {
    await page.getByRole("radio", { name: "Income" }).click();
  }

  await page.getByRole("spinbutton", { name: "Amount", exact: true }).fill(options.amount);
  await selectCombobox(page, "Category", options.category);
  if (options.card) await selectCombobox(page, "Card", options.card);
  if (options.description) {
    await page.getByRole("textbox", { name: "Description", exact: true }).fill(options.description);
  }
  await page
    .getByRole("spinbutton", { name: "Number of payments", exact: true })
    .fill(String(options.occurrencesCount));

  await page.getByRole("button", { name: "Create transaction" }).click();
  await expect(page).toHaveURL(path("/transactions"));
}

/** Opens a row's Actions menu and clicks Edit, returning the id captured from the resulting URL. */
async function editRowAndCaptureId(page: Page, row: ReturnType<typeof transactionRow>): Promise<string> {
  await row.getByRole("button", { name: "Actions" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await page.waitForURL(/\/transactions\/(installments\/|recurring\/)?[^/?]+\/edit/);
  const match = /\/transactions\/(?:installments\/|recurring\/)?([^/?]+)\/edit/.exec(page.url());
  if (!match) throw new Error(`Could not parse an id out of ${page.url()}`);
  return match[1];
}

test.describe("transactions", () => {
  test.afterAll(async () => {
    await closeDb();
  });

  // 1. One-off round trip.
  test("a one-off transaction can be created, edited, and deleted", async ({ page }) => {
    await registerUser(page);
    await expect(page).toHaveURL(path("/dashboard"));
    await createCategory(page, "Groceries");
    await createCard(page, "Personal Visa");

    await createOneOffTransaction(page, {
      amount: "45.50",
      category: "Groceries",
      card: "Personal Visa",
      description: "Weekly groceries",
    });

    const row = transactionRow(page, "Weekly groceries");
    await expect(transactionRows(page)).toHaveCount(1);
    await expect(row.locator("td:nth-child(1)")).toContainText(mdyLabel(new Date()));
    await expect(row.locator("td:nth-child(3)")).toHaveText("Groceries");
    await expect(row.locator("td:nth-child(4)")).toHaveText("−$45.50");

    await editRowAndCaptureId(page, row);
    const amountField = page.getByRole("spinbutton", { name: "Amount", exact: true });
    await expect(amountField).toHaveValue("45.50");
    await amountField.fill("60.00");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(path("/transactions"));

    await expect(transactionRows(page)).toHaveCount(1);
    await expect(transactionRow(page, "Weekly groceries").locator("td:nth-child(4)")).toHaveText("−$60.00");

    await transactionRow(page, "Weekly groceries").getByRole("button", { name: "Actions" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Delete" }).click();
    await expect(dialog).toBeHidden();

    await expect(page.getByText("You don't have any transactions yet.")).toBeVisible();
  });

  // 2. Recurrence round trip.
  test("a recurring transaction can be created, edited, and deleted", async ({ page }) => {
    await registerUser(page);
    await expect(page).toHaveURL(path("/dashboard"));
    await createCategory(page, "Subscriptions");
    await createCard(page, "Personal Visa");

    await createRecurring(page, {
      amount: "20.00",
      category: "Subscriptions",
      card: "Personal Visa",
      description: "Streaming service",
    });

    const row = transactionRow(page, "Streaming service");
    await expect(transactionRows(page)).toHaveCount(1);
    await expect(row).toContainText("Monthly");
    await expect(row).toContainText("Started");
    await expect(row.locator("td:nth-child(4)")).toHaveText("−$20.00");

    await editRowAndCaptureId(page, row);
    const amountField = page.getByRole("spinbutton", { name: "Amount", exact: true });
    await amountField.fill("25.00");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(path("/transactions"));

    await expect(transactionRow(page, "Streaming service").locator("td:nth-child(4)")).toHaveText("−$25.00");

    await transactionRow(page, "Streaming service").getByRole("button", { name: "Actions" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toHaveText(/Delete this recurring transaction\?/);
    await dialog.getByRole("button", { name: "Delete" }).click();
    await expect(dialog).toBeHidden();

    await expect(page.getByText("You don't have any transactions yet.")).toBeVisible();
  });

  // 3. Installment plan.
  test("an installment plan generates every occurrence up front, numbered in series", async ({ page }) => {
    await registerUser(page);
    await expect(page).toHaveURL(path("/dashboard"));
    await createCategory(page, "Electronics");
    await createCard(page, "Personal Visa");

    await createInstallmentPlan(page, {
      amount: "100.00",
      category: "Electronics",
      card: "Personal Visa",
      description: "New laptop",
      occurrencesCount: 12,
    });

    // Monthly occurrences run well past the default "this month" window, so a
    // wide period and ascending date order are what let all 12 show, oldest first.
    await page.goto(
      path(`/transactions?show=installments&from=${WIDE_FROM}&to=${WIDE_TO}&sort=date&dir=asc`),
    );

    const rows = transactionRows(page);
    await expect(rows).toHaveCount(12);
    await expect(rows.first()).toContainText("1 of 12");
    await expect(rows.last()).toContainText("12 of 12");

    await rows.first().getByRole("button", { name: "Actions" }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await expect(page).toHaveURL(/\/transactions\/installments\/[^/?]+\/edit\?occurrence=/);
  });

  // 4. Series vs. occurrence edits.
  test("editing the series changes every row; editing one occurrence changes only that row", async ({
    page,
  }) => {
    await registerUser(page);
    await expect(page).toHaveURL(path("/dashboard"));
    await createCategory(page, "Electronics");
    await createCategory(page, "Home");
    await createCard(page, "Personal Visa");

    await createInstallmentPlan(page, {
      amount: "50.00",
      category: "Electronics",
      card: "Personal Visa",
      description: "Furniture",
      occurrencesCount: 12,
    });

    const listUrl = path(
      `/transactions?show=installments&from=${WIDE_FROM}&to=${WIDE_TO}&sort=date&dir=asc`,
    );
    await page.goto(listUrl);

    const planId = await editRowAndCaptureId(page, transactionRows(page).first());

    // Series-level edit: the category changes for every live occurrence.
    await selectCombobox(page, "Category", "Home");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Saved")).toBeVisible();

    await page.goto(listUrl);
    const categoryCells = transactionRows(page).locator("td:nth-child(3)");
    await expect(categoryCells).toHaveCount(12);
    for (const text of await categoryCells.allInnerTexts()) {
      expect(text).toBe("Home");
    }

    // Occurrence-level edit: only the row whose amount was changed changes.
    await page.goto(path(`/transactions/installments/${planId}/edit`));
    const amountInputs = page.getByRole("spinbutton", { name: /^Payment 1 amount$/ });
    await expect(amountInputs).toBeVisible();

    // Base UI's `Input` (`@base-ui/react/input`) re-applies `defaultValue`
    // once, shortly after this row's own mount — logging "A component is
    // changing the default value state of an uncontrolled FieldControl
    // after being initialized" to the console when it does. That resync
    // clobbers a value typed *before* it fires back to the server's own
    // ("50.00"), which `handleSave` then reads instead of "999.00" —
    // observed directly: `toHaveValue` right after `fill()` can still see
    // the correct value an instant before this fires. It is a one-time
    // event per mount (React Strict Mode's dev-only double-invoke is the
    // likely cause), so waiting for it to fire — or for it to *not* fire
    // within a short window, on a run where it doesn't — before typing is
    // what makes the type stick.
    await page
      .waitForEvent("console", {
        predicate: (msg) => msg.text().includes("uncontrolled FieldControl"),
        timeout: 2000,
      })
      .catch(() => {});
    await amountInputs.fill("999.00");
    await expect(amountInputs).toHaveValue("999.00");
    await page
      .getByRole("row")
      .filter({ has: amountInputs })
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await expect(
      page.getByRole("row").filter({ has: amountInputs }).getByText("Saved"),
    ).toBeVisible();

    await page.goto(listUrl);
    const amountCells = await transactionRows(page).locator("td:nth-child(4)").allInnerTexts();
    const changed = amountCells.filter((text) => text === "−$999.00");
    const unchanged = amountCells.filter((text) => text === "−$50.00");
    expect(changed).toHaveLength(1);
    expect(unchanged).toHaveLength(11);
  });

  // 5. Plan deletion.
  test("deleting a plan removes every one of its occurrences", async ({ page }) => {
    await registerUser(page);
    await expect(page).toHaveURL(path("/dashboard"));
    await createCategory(page, "Electronics");
    await createCard(page, "Personal Visa");

    await createInstallmentPlan(page, {
      amount: "50.00",
      category: "Electronics",
      card: "Personal Visa",
      description: "Furniture",
      occurrencesCount: 12,
    });

    const listUrl = path(
      `/transactions?show=installments&from=${WIDE_FROM}&to=${WIDE_TO}&sort=date&dir=asc`,
    );
    await page.goto(listUrl);
    await expect(transactionRows(page)).toHaveCount(12);

    await editRowAndCaptureId(page, transactionRows(page).first());
    await page.getByRole("button", { name: "Delete plan" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toHaveText(/Delete these installments\?/);
    await dialog.getByRole("button", { name: "Delete" }).click();
    await expect(page).toHaveURL(path("/transactions"));

    await page.goto(listUrl);
    // Not "No transactions match these filters." — this plan was the only
    // thing this user ever created, so `hasAnyTransactions` is false too,
    // and the table falls all the way back to the first-run empty state.
    await expect(page.getByText("You don't have any transactions yet.")).toBeVisible();
  });

  // 6. Generated rows of an ongoing recurrence stay hidden.
  test("a generated occurrence of an ongoing recurrence never appears as its own row", async ({
    page,
  }) => {
    const email = uniqueEmail("recurring-gen");
    await registerUser(page, { email });
    await expect(page).toHaveURL(path("/dashboard"));
    await createCategory(page, "Subscriptions");
    await createCard(page, "Personal Visa");

    await createRecurring(page, {
      amount: "30.00",
      category: "Subscriptions",
      card: "Personal Visa",
      description: "Streaming service",
    });
    await expect(transactionRows(page)).toHaveCount(1);

    const userId = await getUserIdByEmail(email);
    const categoryId = await getCategoryIdByName(userId, "Subscriptions");
    const cardId = await getCardIdByName(userId, "Personal Visa");
    const recurringId = await editRowAndCaptureId(page, transactionRow(page, "Streaming service"));

    // Nothing in the app generates this yet — a future cron job's job,
    // simulated here by writing the row a generation run would produce.
    await insertTransaction({
      userId,
      categoryId,
      cardId,
      type: "EXPENSE",
      amount: "30.00",
      description: "Streaming service",
      date: todayIso(),
      recurringTransactionId: recurringId,
    });

    await page.goto(path("/transactions"));
    // Still one row: the definition, not a second row for the generated
    // occurrence. `singleArm` excludes anything with a
    // `recurring_transaction_id`, and `installmentArm` requires
    // `fixed_occurrences_count = true` — this recurrence is `false`, so the
    // generated row matches neither arm.
    await expect(transactionRows(page)).toHaveCount(1);
    await expect(transactionRows(page).first()).toContainText("Monthly");
  });

  // 7. Filters round-trip through the URL.
  test("filters apply through the URL, survive a fresh page, and Clear resets them", async ({
    page,
    context,
  }) => {
    await registerUser(page);
    await expect(page).toHaveURL(path("/dashboard"));
    await createCategory(page, "Groceries");
    await createCategory(page, "Salary");
    await createCard(page, "Personal Visa");

    await createOneOffTransaction(page, {
      amount: "10.00",
      category: "Groceries",
      card: "Personal Visa",
      description: "Weekly groceries",
    });
    await createOneOffTransaction(page, {
      type: "Income",
      amount: "500.00",
      category: "Salary",
      description: "Paycheck",
    });

    await page.goto(path("/transactions"));
    await expect(transactionRows(page)).toHaveCount(2);

    await ensureFiltersOpen(page);
    await selectCombobox(page, "Category", "Groceries");
    await page.getByRole("combobox", { name: "Type", exact: true }).click();
    await page.getByRole("option", { name: "Expense", exact: true }).click();
    // A period different from the default (this month up to today) so it's
    // written into the URL too — the default's own `from` is the 1st.
    await pickDate(page, "From", new Date());
    await page.getByRole("button", { name: "Apply" }).click();

    await page.waitForURL(/\/transactions\?/);
    const url = new URL(page.url());
    expect(url.searchParams.get("category")).toBeTruthy();
    expect(url.searchParams.get("type")).toBe("EXPENSE");
    expect(url.searchParams.get("from")).toBe(todayIso());

    await expect(transactionRows(page)).toHaveCount(1);
    await expect(transactionRow(page, "Weekly groceries")).toBeVisible();

    // The same URL, opened fresh: same filters, same result.
    const freshPage = await context.newPage();
    await freshPage.goto(page.url());
    await expect(transactionRows(freshPage)).toHaveCount(1);
    await expect(transactionRow(freshPage, "Weekly groceries")).toBeVisible();
    await freshPage.close();

    await ensureFiltersOpen(page);
    await page.getByRole("button", { name: "Clear" }).click();
    await expect(page).toHaveURL(path("/transactions"));
  });

  // 8. `show` distinguishes all four cases.
  test("the show filter isolates one-off, recurring, and installment rows", async ({ page }) => {
    await registerUser(page);
    await expect(page).toHaveURL(path("/dashboard"));
    // "AAA"-prefixed, per `selectCombobox`'s comment: three customs plus the
    // 11 presets is 14 options, and only the first 10 (unfiltered) are ever
    // clicked from, so all three have to sort ahead of every preset.
    await createCategory(page, "AAA Groceries");
    await createCategory(page, "AAA Subscriptions");
    await createCategory(page, "AAA Electronics");
    await createCard(page, "Personal Visa");

    await createOneOffTransaction(page, {
      amount: "10.00",
      category: "AAA Groceries",
      card: "Personal Visa",
      description: "Weekly groceries",
    });
    await createRecurring(page, {
      amount: "20.00",
      category: "AAA Subscriptions",
      card: "Personal Visa",
      description: "Streaming service",
    });
    await createInstallmentPlan(page, {
      amount: "30.00",
      category: "AAA Electronics",
      card: "Personal Visa",
      description: "Headphones",
      occurrencesCount: 1,
    });

    await page.goto(path("/transactions?show=all"));
    await expect(transactionRows(page)).toHaveCount(3);

    await page.goto(path("/transactions?show=single"));
    await expect(transactionRows(page)).toHaveCount(1);
    await expect(transactionRow(page, "Weekly groceries")).toBeVisible();

    await page.goto(path("/transactions?show=recurring"));
    await expect(transactionRows(page)).toHaveCount(1);
    await expect(transactionRow(page, "Streaming service")).toBeVisible();

    await page.goto(path("/transactions?show=installments"));
    await expect(transactionRows(page)).toHaveCount(1);
    await expect(transactionRow(page, "Headphones")).toBeVisible();
  });

  // 9. Pagination.
  test("51 one-off transactions paginate 50/1 with no row duplicated across pages", async ({
    page,
  }) => {
    const email = uniqueEmail("pagination");
    await registerUser(page, { email });
    await expect(page).toHaveURL(path("/dashboard"));
    await createCategory(page, "Groceries");
    await createCard(page, "Personal Visa");

    const userId = await getUserIdByEmail(email);
    const categoryId = await getCategoryIdByName(userId, "Groceries");
    const cardId = await getCardIdByName(userId, "Personal Visa");

    for (let i = 1; i <= 51; i++) {
      await insertTransaction({
        userId,
        categoryId,
        cardId,
        type: "EXPENSE",
        amount: "1.00",
        description: `Bulk txn ${i}`,
        date: todayIso(),
      });
    }

    await page.goto(path("/transactions"));
    const rows = transactionRows(page);
    await expect(rows).toHaveCount(50);
    const firstPageDescriptions = await rows.locator("td:nth-child(2)").allInnerTexts();

    await page.getByRole("link", { name: "Next", exact: true }).click();
    await expect(rows).toHaveCount(1);
    const secondPageDescriptions = await rows.locator("td:nth-child(2)").allInnerTexts();

    expect(firstPageDescriptions).toHaveLength(50);
    expect(secondPageDescriptions).toHaveLength(1);
    for (const description of secondPageDescriptions) {
      expect(firstPageDescriptions).not.toContain(description);
    }
  });

  // 9b. Pagination over an installment plan — the count query drops the `series` CTE join the page query keeps.
  test("a 60-occurrence installment plan paginates 50/10 across two pages", async ({ page }) => {
    const email = uniqueEmail("installment-pagination");
    await registerUser(page, { email });
    await expect(page).toHaveURL(path("/dashboard"));
    await createCategory(page, "Electronics");
    await createCard(page, "Personal Visa");

    const userId = await getUserIdByEmail(email);
    const categoryId = await getCategoryIdByName(userId, "Electronics");
    const cardId = await getCardIdByName(userId, "Personal Visa");

    const planId = await insertRecurringTransaction({
      userId,
      categoryId,
      cardId,
      type: "EXPENSE",
      amount: "10.00",
      description: "Bulk plan",
      frequency: "MONTHLY",
      startDate: todayIso(),
      fixedOccurrencesCount: true,
      occurrencesCount: 60,
    });

    for (let i = 1; i <= 60; i++) {
      await insertTransaction({
        userId,
        categoryId,
        cardId,
        type: "EXPENSE",
        amount: "10.00",
        description: "Bulk plan",
        date: todayIso(),
        recurringTransactionId: planId,
      });
    }

    await page.goto(path("/transactions?show=installments"));
    await expect(transactionRows(page)).toHaveCount(50);

    await page.getByRole("link", { name: "Next", exact: true }).click();
    await expect(transactionRows(page)).toHaveCount(10);

    await expect(page.getByRole("link", { name: "Page 1", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Page 2", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Page 3", exact: true })).toHaveCount(0);
  });

  // 10. Sorting.
  test("clicking a sortable header re-sorts, and a second click flips direction", async ({ page }) => {
    await registerUser(page);
    await expect(page).toHaveURL(path("/dashboard"));
    // Named to sort ahead of every one of the 11 seeded presets ("AAA" <
    // "Education") so all three land on the options popup's first
    // (unfiltered) page — see `selectCombobox`'s comment on why nothing here
    // can rely on searching past that page.
    await createCategory(page, "AAA1 costs");
    await createCategory(page, "AAA2 costs");
    await createCategory(page, "AAA3 costs");
    await createCard(page, "Wallet");

    // Distinct date, category, description, and amount per row, chosen so
    // sorting by each of the four columns picks out a different "first row".
    await createOneOffTransaction(page, {
      amount: "30.00",
      category: "AAA1 costs",
      card: "Wallet",
      description: "Zebra purchase",
      daysAgo: 2,
    });
    await createOneOffTransaction(page, {
      amount: "20.00",
      category: "AAA2 costs",
      card: "Wallet",
      description: "Mango purchase",
      daysAgo: 1,
    });
    await createOneOffTransaction(page, {
      amount: "10.00",
      category: "AAA3 costs",
      card: "Wallet",
      description: "Apple purchase",
    });

    await page.goto(path("/transactions"));
    await expect(transactionRows(page)).toHaveCount(3);

    async function firstRowDescription(): Promise<string> {
      return (await transactionRows(page).first().locator("td:nth-child(2)").innerText()).trim();
    }

    // Clicks a column header and waits for the URL's own `sort`/`dir` to
    // reflect it before returning. Two clicks on the same link back to back
    // (the second-click-flips-direction case below) otherwise race: the
    // second click's target `href` depends on the *first* click's
    // navigation having already re-rendered `sortHrefs` with the new
    // current sort — without waiting for that, the second click can still
    // read the pre-navigation href and silently repeat the first, which is
    // exactly what an `expect.poll` on the row alone can't distinguish from
    // a slow (rather than absent) update.
    async function clickSort(column: string, sort: string, dir: "asc" | "desc"): Promise<void> {
      await page.getByRole("link", { name: `Sort by ${column}`, exact: true }).click();
      await page.waitForURL((url) => {
        const actualSort = url.searchParams.get("sort") ?? "date";
        const actualDir = url.searchParams.get("dir") ?? "desc";
        return actualSort === sort && actualDir === dir;
      });
    }

    // Default sort is date desc: the most recent (today, "Apple") leads.
    await expect.poll(firstRowDescription).toContain("Apple purchase");

    // Clicking the already-active "Date" column flips it to ascending.
    await clickSort("Date", "date", "asc");
    await expect.poll(firstRowDescription).toContain("Zebra purchase");
    await clickSort("Date", "date", "desc");
    await expect.poll(firstRowDescription).toContain("Apple purchase");

    // A newly clicked column starts descending.
    await clickSort("Description", "description", "desc");
    await expect.poll(firstRowDescription).toContain("Zebra purchase");
    await clickSort("Description", "description", "asc");
    await expect.poll(firstRowDescription).toContain("Apple purchase");

    await clickSort("Category", "category", "desc");
    await expect.poll(firstRowDescription).toContain("Apple purchase");
    await clickSort("Category", "category", "asc");
    await expect.poll(firstRowDescription).toContain("Zebra purchase");

    await clickSort("Amount", "amount", "desc");
    await expect.poll(firstRowDescription).toContain("Zebra purchase");
    await clickSort("Amount", "amount", "asc");
    await expect.poll(firstRowDescription).toContain("Apple purchase");
  });

  // 10b. A soft-deleted transaction is not reachable by URL.
  test("navigating straight to a deleted transaction's edit URL 404s", async ({ page }) => {
    await registerUser(page);
    await expect(page).toHaveURL(path("/dashboard"));
    await createCategory(page, "Groceries");
    await createCard(page, "Personal Visa");

    await createOneOffTransaction(page, {
      amount: "10.00",
      category: "Groceries",
      card: "Personal Visa",
      description: "Weekly groceries",
    });

    const row = transactionRow(page, "Weekly groceries");
    const id = await editRowAndCaptureId(page, row);
    await page.goto(path("/transactions"));

    await transactionRow(page, "Weekly groceries").getByRole("button", { name: "Actions" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    const dialog = page.getByRole("alertdialog");
    await dialog.getByRole("button", { name: "Delete" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("You don't have any transactions yet.")).toBeVisible();

    // The soft delete really happened at the database level, not just in
    // the client's optimistic view.
    const [dbRow] = await dbQuery<{ deactivated_at: string | null }>(
      "SELECT deactivated_at FROM transactions WHERE id = $1",
      [id],
    );
    expect(dbRow?.deactivated_at).not.toBeNull();

    const response = await page.goto(path(`/transactions/${id}/edit`));
    // Not a literal 404 — confirmed by hand, and documented Next.js
    // behavior, not an application bug: this route ships a `loading.tsx`
    // (required by `.claude/rules/navigation-loading.md` for every route in
    // the shell), which wraps the page in an *implicit* `<Suspense>`. Per
    // `node_modules/next/dist/docs/.../functions/not-found.md`'s own
    // "Calling notFound() after streaming has started" section: "the
    // response has already begun streaming as a 200, and the status can't
    // change once streaming has started" — the 200 is already committed by
    // the time the page's own `await prisma.transaction.findFirst(...)`
    // resolves and calls `notFound()`. Removing the route's `loading.tsx`
    // would restore a real 404 status, but at the cost of violating that
    // same rule for every navigation into this page — a genuine trade-off,
    // not a one-line fix, so it's reported here rather than changed.
    //
    // What actually matters — the guard's real job — still holds and is
    // what the rest of this assertion checks: the not-found UI renders for
    // real, and critically, the deleted transaction's data never reaches a
    // form the user could re-save.
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
    await expect(page.getByText("This page does not exist.")).toBeVisible();
    await expect(page.getByRole("spinbutton", { name: "Amount", exact: true })).toHaveCount(0);
  });

  // 10c. An installment occurrence has no edit page of its own — the one-off
  // editor must not open it.
  test("navigating straight to an installment occurrence's one-off edit URL 404s", async ({ page }) => {
    const email = uniqueEmail("installment-occurrence-edit");
    await registerUser(page, { email });
    await expect(page).toHaveURL(path("/dashboard"));
    await createCategory(page, "Electronics");
    await createCard(page, "Personal Visa");

    await createInstallmentPlan(page, {
      amount: "100.00",
      category: "Electronics",
      card: "Personal Visa",
      description: "New laptop",
      occurrencesCount: 12,
    });

    const userId = await getUserIdByEmail(email);

    // One of the plan's own generated rows, fetched directly — no UI flow
    // exposes an occurrence's raw transaction id, only its plan id.
    const [occurrence] = await dbQuery<{ id: string }>(
      `SELECT t.id FROM transactions t
         JOIN recurring_transactions r ON r.id = t.recurring_transaction_id
        WHERE r.user_id = $1 AND r.fixed_occurrences_count = true
        LIMIT 1`,
      [userId],
    );
    if (!occurrence) throw new Error("Expected the installment plan to have generated at least one row");

    // Same not-found UI the soft-deleted-edit scenario above asserts, and for
    // the same documented reason: `notFound()` here still yields a 200 with
    // the not-found UI, not a literal 404 status, because this route's
    // `loading.tsx` has already committed the response as streaming before
    // the page's own `prisma.transaction.findFirst(...)` resolves.
    const response = await page.goto(path(`/transactions/${occurrence.id}/edit`));
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
    await expect(page.getByText("This page does not exist.")).toBeVisible();
    await expect(page.getByRole("spinbutton", { name: "Amount", exact: true })).toHaveCount(0);
  });

  // 11. A garbage query string renders page 1.
  test("a garbage query string is ignored in favor of the default view", async ({ page }) => {
    await registerUser(page);
    await expect(page).toHaveURL(path("/dashboard"));

    const response = await page.goto(path("/transactions?sort=drop%20table&page=-4&from=nonsense"));
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible();
    await expect(page.getByText("You don't have any transactions yet.")).toBeVisible();
  });

  // 12. Server-side enforcement.
  test("submitting a transaction with another user's category id is refused server-side", async ({
    page,
  }) => {
    const emailB = uniqueEmail("victim");
    await registerUser(page, { email: emailB });
    await expect(page).toHaveURL(path("/dashboard"));
    await createCategory(page, "Foreign category");
    const userIdB = await getUserIdByEmail(emailB);
    const foreignCategoryId = await getCategoryIdByName(userIdB, "Foreign category");

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(path("/login"));

    const emailA = uniqueEmail("attacker");
    await registerUser(page, { email: emailA });
    await expect(page).toHaveURL(path("/dashboard"));
    await createCategory(page, "My category");
    const userIdA = await getUserIdByEmail(emailA);
    const ownCategoryId = await getCategoryIdByName(userIdA, "My category");

    // The form only ever offers this user's own categories, so there is no
    // honest way to pick another user's id through the combobox — the point
    // of this test. Instead, the real form is filled and submitted normally,
    // and the network request the Server Action call makes is intercepted
    // and tampered with, the way a malicious client bypassing its own UI
    // would: the *server*, not the form, is what must refuse this.
    await page.route(path("/transactions/new"), async (route) => {
      const request = route.request();
      if (request.method() !== "POST") {
        await route.continue();
        return;
      }
      const postData = request.postData();
      if (postData?.includes(ownCategoryId)) {
        await route.continue({ postData: postData.split(ownCategoryId).join(foreignCategoryId) });
        return;
      }
      await route.continue();
    });

    await page.goto(path("/transactions/new"));
    await page.getByRole("spinbutton", { name: "Amount", exact: true }).fill("10.00");
    await selectCombobox(page, "Category", "My category");
    await page.getByRole("button", { name: "Create transaction" }).click();

    await expect(page.locator("form").getByRole("alert")).toHaveText(
      "There was a problem with the information you submitted. Please check the fields and try again.",
    );
    await expect(page).toHaveURL(path("/transactions/new"));

    await page.goto(path("/transactions"));
    await expect(page.getByText("You don't have any transactions yet.")).toBeVisible();
  });
});
