import { expect, type Page, test } from "@playwright/test";

import {
  closeDb,
  countTransactions,
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
 * The rendered column order, 1-indexed for `td:nth-child(n)` — kept in step
 * with `COLUMNS` in `src/components/transactions/transaction-table.tsx`. It
 * is a named map rather than a literal in each assertion because the order
 * has already changed once (Task 7 moved Date from first to sixth and put
 * Value second), and a bare `td:nth-child(4)` reads as correct no matter
 * which column it lands on — the pagination scenario below silently compared
 * amounts while believing they were descriptions.
 */
const COLUMN = {
  description: 1,
  value: 2,
  category: 3,
  card: 4,
  type: 5,
  date: 6,
  paymentDate: 7,
  actions: 8,
} as const;

/** One cell of a row, by column name. `rows` may be a single row or a set of them. */
function cell(rows: ReturnType<typeof transactionRows>, column: keyof typeof COLUMN) {
  return rows.locator(`td:nth-child(${COLUMN[column]})`);
}

/**
 * The transaction amount field. A `MoneyInput` (`src/components/ui/money-input.tsx`),
 * so `type="text"` — `getByRole("spinbutton")` no longer matches anything.
 *
 * `getByRole(..., { name })` and not `getByLabel(..., { exact: true })`: the
 * field is required, so its `<Label>` renders a trailing `*` inside an
 * `aria-hidden` span. That keeps the asterisk out of the accessible name
 * (which is what `getByRole` matches) but *not* out of the label's raw text
 * (which is what `getByLabel` matches) — see `.claude/rules/ui.md`, and
 * `cards.spec.ts`/`categories.spec.ts` for the same query on their own
 * required Name fields.
 *
 * `fill` still takes the canonical `"45.50"`: the mask keeps only digits and
 * reads the last two as cents, so `"45.50"` and `"4550"` both land on
 * `45.50`. Its *displayed* value is grouped per the user's `NumberFormat`
 * (`COMMA_DOT` for a freshly registered user), so only amounts below 1000
 * round-trip through `toHaveValue` unchanged — every amount here is.
 */
function amountField(page: Page) {
  return page.getByRole("textbox", { name: "Value", exact: true });
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

/** Whole calendar months from `to` back to `from` — negative when `to` is later. */
function monthsBetween(from: Date, to: Date): number {
  return (from.getFullYear() - to.getFullYear()) * 12 + (from.getMonth() - to.getMonth());
}

/**
 * Opens a `DatePicker` by its trigger's accessible name, pages to the target
 * month, and clicks the day.
 *
 * `DatePicker` opens on the month of its *current value* — today for every
 * create form, which is why `openOn` defaults to `today()`. A picker seeded
 * with something else (the payment-date one, seeded with the transaction's
 * own date) passes what it was seeded with. The paging is computed rather
 * than assumed because "two days ago" and "today" are the same month on 28
 * days out of 30 and different months on the other two — a suite that only
 * ever ran mid-month would look fine and fail on the 1st.
 *
 * The nav buttons' accessible names are react-day-picker's own defaults
 * (`labelPrevious`/`labelNext` in
 * `node_modules/react-day-picker/dist/cjs/labels/`), not anything this app
 * names.
 */
async function pickDate(
  page: Page,
  triggerLabel: string,
  date: Date,
  { openOn }: { openOn?: Date } = {},
): Promise<void> {
  await page.getByRole("button", { name: triggerLabel, exact: true }).click();
  const months = monthsBetween(openOn ?? today(), date);
  for (let i = 0; i < months; i++) {
    await page.getByRole("button", { name: "Go to the Previous Month" }).click();
  }
  for (let i = 0; i > months; i--) {
    await page.getByRole("button", { name: "Go to the Next Month" }).click();
  }
  await page.getByRole("button", { name: dayButtonNameRegex(date) }).click();
}

/** The day button for `date`, inside whatever `DatePicker` popup is currently open. */
function dayButton(page: Page, date: Date) {
  return page.getByRole("button", { name: dayButtonNameRegex(date) });
}

/**
 * Every `Date` this file builds is a *local-midnight* one whose local Y/M/D
 * are the calendar date being named — the shape `Calendar` reads (see
 * `toLocalMidnight` in `src/components/ui/date-picker.tsx`), so its local
 * parts are also what `isoDate` and `mdyLabel` must read to agree with what
 * the app renders.
 */
function isoDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * The app's "today", not the runner's.
 *
 * Every ceiling in this feature is `toIsoDate(new Date())`, computed on the
 * server — and `toIsoDate` reads **UTC** parts (`src/lib/dates.ts`, which
 * does all its calendar arithmetic in UTC on purpose). A runner west of UTC
 * is still on the previous day for the last hours of every UTC day, so a
 * plain `new Date()` here disagrees with the server about what day it is for
 * part of every run — long enough that this suite failed exactly that way
 * once: the list rendered 08/21 while the spec expected 08/20, and the
 * "future date" scenario picked a tomorrow the server considered today.
 *
 * So this reads UTC parts and rebuilds them as a local-midnight `Date`, per
 * `isoDate` above. Everything derived from "now" goes through it.
 */
function today(): Date {
  const now = new Date();
  return new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function daysAgo(days: number): Date {
  const date = today();
  date.setDate(date.getDate() - days);
  return date;
}

function daysFromToday(days: number): Date {
  const date = today();
  date.setDate(date.getDate() + days);
  return date;
}

/**
 * A fixed day of the previous month. The date-ceiling scenarios below are
 * anchored here rather than on `daysAgo(n)` so that a transaction date and
 * the payment dates just either side of it are always in one displayed
 * month: `daysAgo(3)` and `daysAgo(2)` straddle a month boundary on the 3rd
 * of a month and nowhere else, which is exactly the kind of two-days-a-year
 * failure nobody would be around to diagnose. Days 9–11 exist in every
 * month, and all of the previous month is safely in the past, so
 * `date <= today` holds for all three.
 */
function previousMonthDay(day: number): Date {
  const anchor = today();
  return new Date(anchor.getFullYear(), anchor.getMonth() - 1, day);
}

function todayIso(): string {
  return isoDate(today());
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

/**
 * Inside `MIN_TRANSACTION_DATE`..`MAX_TRANSACTION_DATE` and far past any
 * plausible "today", so the rule a payload carrying it breaks is the
 * not-in-the-future one and never `date.outOfRange`. Ten characters, like
 * every other `YYYY-MM-DD` — see `tamperServerActionBody`.
 */
const FUTURE_DATE = "2099-01-01";

type OneOffOptions = {
  type?: "Income" | "Expense";
  amount: string;
  category: string;
  card?: string | null;
  description?: string;
  /** Days before today. 0 (the default) leaves the form's own default (today) untouched. */
  daysAgo?: number;
  /** An explicit transaction date, for scenarios `daysAgo` cannot express safely. */
  date?: Date;
  /**
   * Turns on the form's "Already paid" switch, which seeds the payment date
   * with the transaction's own date (capped at today) — see `maxPaymentDate`
   * in `src/components/transactions/transaction-form.tsx`.
   */
  paid?: boolean;
  /**
   * Picks an explicit payment date instead of the seeded one. Implies
   * `paid`, since the picker only exists once the switch is on.
   */
  paymentDate?: Date;
};

/** Fills and submits the one-off transaction form, and waits for the redirect back to the list. */
async function createOneOffTransaction(page: Page, options: OneOffOptions): Promise<void> {
  await page.goto(path("/transactions/new"));

  if (options.type === "Income") {
    await page.getByRole("radio", { name: "Income" }).click();
  }

  await amountField(page).fill(options.amount);
  await selectCombobox(page, "Category", options.category);
  if (options.card) await selectCombobox(page, "Card", options.card);

  const date = options.date ?? (options.daysAgo ? daysAgo(options.daysAgo) : today());
  if (options.date || options.daysAgo) await pickDate(page, "Date", date);

  if (options.description) {
    await page.getByRole("textbox", { name: "Description", exact: true }).fill(options.description);
  }
  if (options.paid || options.paymentDate) {
    await page.getByRole("switch", { name: "Already paid" }).click();
  }
  if (options.paymentDate) {
    // The switch seeded this picker with the transaction's own date, so that
    // — not today — is the month it opens on.
    await pickDate(page, "Payment date", options.paymentDate, { openOn: date });
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

  await amountField(page).fill(options.amount);
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

  await amountField(page).fill(options.amount);
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

/**
 * The generic message every Server Action in `src/lib/actions/transactions.ts`
 * returns for a payload its schema refused — `transactions.invalidInput`. It
 * deliberately never names the rule that failed, so it is the same string for
 * every bypass scenario below.
 */
const INVALID_INPUT =
  "There was a problem with the information you submitted. Please check the fields and try again.";

/**
 * Rewrites `find` to `replace` inside the body of the Server Action POST the
 * page is about to make, and reports whether it ever fired.
 *
 * This is how a server-side rule gets tested *past* the form, which
 * `.claude/rules/validation.md` requires: "a rule enforced only in the
 * browser is not enforced", and a rule only the form exercises is untested.
 * `e2e/registration.spec.ts` does the same thing by posting straight at
 * `/api/auth/sign-up/email` — but these rules live in a Server Action, not a
 * route handler, and a Server Action has no stable URL or documented body
 * format to post at by hand: it is addressed by a build-specific
 * `next-action` id over React's own flight encoding. So instead of forging a
 * request, this lets the browser build a genuine one — correct id, correct
 * encoding, real session cookie — and mutates one value in flight, exactly
 * what a client that had been patched to skip its own validation would send.
 *
 * `find` and `replace` must be the same length, and this helper throws
 * otherwise. Not because the encoding demands it — the body goes out as
 * `text/plain;charset=UTF-8` with no length prefixes and no multipart
 * framing, so a longer replacement would in fact parse fine. What the rule
 * buys is that every swap is a same-shape value for a same-shape value: one
 * `YYYY-MM-DD` for another, one cuid for another. That keeps each caller's
 * "this string occurs exactly once in the payload" reasoning trivially true,
 * which is the property the assertions actually rest on, and stops a swap
 * from quietly widening into something the payload never contained.
 *
 * The returned `applied()` is not decoration. If the value never appears in
 * the body — a different encoding, a renamed field — the request passes
 * through untouched, the action succeeds, and every "was it refused?"
 * assertion would be testing a submission that was never tampered with in
 * the first place. Asserting `applied()` is what stops that from reading as
 * coverage.
 */
async function tamperServerActionBody(
  page: Page,
  url: string,
  find: string,
  replace: string,
): Promise<() => boolean> {
  if (find.length !== replace.length) {
    throw new Error(`Tampered values must be the same length: "${find}" vs "${replace}"`);
  }

  let applied = false;
  await page.route(url, async (route) => {
    const request = route.request();
    if (request.method() !== "POST") {
      await route.continue();
      return;
    }
    const postData = request.postData();
    if (postData?.includes(find)) {
      applied = true;
      await route.continue({ postData: postData.split(find).join(replace) });
      return;
    }
    await route.continue();
  });

  return () => applied;
}

/**
 * Opens a row's Actions menu and clicks one of its items.
 *
 * The click is retried until the menu actually opens. A single click is a
 * real, if rare, flake: `TransactionRowActions` is a Client Component, and
 * the trigger is visible and stable — everything `click()` waits for — from
 * the moment the server-rendered HTML paints, which is *before* React has
 * hydrated it and attached the handler that opens the menu. A click landing
 * in that window does nothing at all, and the wait for the menu item then
 * burns the whole test timeout with no second attempt. Caught on a full-suite
 * run of exactly this helper, where the list page is heavier and hydration
 * later than in the single-file runs where it always passed.
 *
 * Re-clicking is safe: the retry only runs when the item is *not* visible,
 * i.e. when the menu is closed, so it can never toggle an open menu shut.
 */
async function clickRowAction(
  page: Page,
  row: ReturnType<typeof transactionRow>,
  action: "Edit" | "Delete",
): Promise<void> {
  const trigger = row.getByRole("button", { name: "Actions" });
  const item = page.getByRole("menuitem", { name: action, exact: true });

  await expect(async () => {
    await trigger.click();
    await expect(item).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });

  await item.click();
}

/** Opens a row's Actions menu and clicks Edit, returning the id captured from the resulting URL. */
async function editRowAndCaptureId(page: Page, row: ReturnType<typeof transactionRow>): Promise<string> {
  await clickRowAction(page, row, "Edit");
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
    await expect(cell(row, "date")).toContainText(mdyLabel(today()));
    await expect(cell(row, "category")).toHaveText("Groceries");
    await expect(cell(row, "value")).toHaveText("−$45.50");
    // Created without the "Already paid" switch, so the Payment date column
    // carries the badge rather than a date.
    await expect(cell(row, "paymentDate")).toHaveText("Not paid");

    await editRowAndCaptureId(page, row);
    const amount = amountField(page);
    await expect(amount).toHaveValue("45.50");
    await amount.fill("60.00");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(path("/transactions"));

    await expect(transactionRows(page)).toHaveCount(1);
    await expect(cell(transactionRow(page, "Weekly groceries"), "value")).toHaveText("−$60.00");

    await clickRowAction(page, transactionRow(page, "Weekly groceries"), "Delete");
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
    await expect(cell(row, "value")).toHaveText("−$20.00");
    // A recurrence is a definition, not a payment — it never shows a payment
    // date, and never the "Not paid" badge either.
    await expect(cell(row, "paymentDate")).toHaveText("—");

    await editRowAndCaptureId(page, row);
    const amount = amountField(page);
    await amount.fill("25.00");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(path("/transactions"));

    await expect(cell(transactionRow(page, "Streaming service"), "value")).toHaveText("−$25.00");

    await clickRowAction(page, transactionRow(page, "Streaming service"), "Delete");
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

    await clickRowAction(page, rows.first(), "Edit");
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
    const categoryCells = cell(transactionRows(page), "category");
    await expect(categoryCells).toHaveCount(12);
    for (const text of await categoryCells.allInnerTexts()) {
      expect(text).toBe("Home");
    }

    // Occurrence-level edit: only the row whose amount was changed changes.
    await page.goto(path(`/transactions/installments/${planId}/edit`));
    const amountInputs = page.getByRole("textbox", { name: /^Payment 1 value$/ });
    await expect(amountInputs).toBeVisible();

    // This used to need a wait for Base UI's `Input` to re-apply its
    // `defaultValue` — an uncontrolled field's one-time post-mount resync,
    // which clobbered anything typed before it fired. The row's amount is a
    // controlled `MoneyInput` now (Task 3), holding its value in React state
    // rather than in the DOM, so there is no resync left to race and the wait
    // is gone with it. `MoneyInput`'s own header comment records the same
    // change from the other side.
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
    const amountCells = await cell(transactionRows(page), "value").allInnerTexts();
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
    await pickDate(page, "From", today());
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
    const firstPageDescriptions = await cell(rows, "description").allInnerTexts();

    await page.getByRole("link", { name: "Next", exact: true }).click();
    await expect(rows).toHaveCount(1);
    const secondPageDescriptions = await cell(rows, "description").allInnerTexts();

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
      return (await cell(transactionRows(page).first(), "description").innerText()).trim();
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

    // The column now reads "Value", so that is what its "Sort by …" link is
    // named — but the URL's own `sort` value stays `amount`, deliberately, so
    // links already in the wild keep working (`COLUMNS` in
    // `transaction-table.tsx`). Asserting both in one call is what would
    // catch a rename that changed the wire format too.
    await clickSort("Value", "amount", "desc");
    await expect.poll(firstRowDescription).toContain("Zebra purchase");
    await clickSort("Value", "amount", "asc");
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

    await clickRowAction(page, transactionRow(page, "Weekly groceries"), "Delete");
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
    await expect(amountField(page)).toHaveCount(0);
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
    await expect(amountField(page)).toHaveCount(0);
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
    const tampered = await tamperServerActionBody(
      page,
      path("/transactions/new"),
      ownCategoryId,
      foreignCategoryId,
    );

    await page.goto(path("/transactions/new"));
    await amountField(page).fill("10.00");
    await selectCombobox(page, "Category", "My category");
    await page.getByRole("button", { name: "Create transaction" }).click();

    await expect(page.locator("form").getByRole("alert")).toHaveText(INVALID_INPUT);
    await expect(page).toHaveURL(path("/transactions/new"));
    expect(tampered()).toBe(true);

    await page.goto(path("/transactions"));
    await expect(page.getByText("You don't have any transactions yet.")).toBeVisible();
  });

  // 13. Payment dates round-trip: form → database → list.
  test("a payment date set on the form is stored and shown, and clearing it shows Not paid", async ({
    page,
  }) => {
    const email = uniqueEmail("payment-date");
    await registerUser(page, { email });
    await expect(page).toHaveURL(path("/dashboard"));
    await createCategory(page, "Groceries");
    await createCard(page, "Personal Visa");

    const transactionDate = previousMonthDay(10);
    const paidOn = previousMonthDay(9);

    await createOneOffTransaction(page, {
      amount: "45.50",
      category: "Groceries",
      card: "Personal Visa",
      description: "Settled groceries",
      date: transactionDate,
      // No paging of its own: the switch seeds the payment date with the
      // transaction's date, so the popup already opens on last month.
      paymentDate: paidOn,
    });
    await createOneOffTransaction(page, {
      amount: "12.00",
      category: "Groceries",
      card: "Personal Visa",
      description: "Outstanding groceries",
    });

    // A wide window: the paid row is dated last month, outside the default
    // period (this month up to today).
    const listUrl = path(`/transactions?from=${WIDE_FROM}&to=${WIDE_TO}`);
    await page.goto(listUrl);

    // Neither description contains the other: `transactionRow`'s `hasText`
    // is a case-insensitive *substring* match, so "Paid groceries" and
    // "Unpaid groceries" — the obvious pair to name these — would both match
    // a lookup for the first one, and every cell assertion would fail strict
    // mode instead of failing usefully.
    const paidRow = transactionRow(page, "Settled groceries");
    await expect(cell(paidRow, "date")).toContainText(mdyLabel(transactionDate));
    await expect(cell(paidRow, "paymentDate")).toHaveText(mdyLabel(paidOn));
    await expect(cell(transactionRow(page, "Outstanding groceries"), "paymentDate")).toHaveText(
      "Not paid",
    );

    // The column is rendering a stored value, not echoing the form. Read as
    // text in SQL rather than as a `Date`: `payment_date` is a `timestamp`
    // without a zone, and letting `pg` hand back a JS `Date` would reinterpret
    // that UTC midnight in the runner's local zone and shift the day.
    const userId = await getUserIdByEmail(email);
    const [stored] = await dbQuery<{ payment_date: string | null }>(
      `SELECT to_char(payment_date, 'YYYY-MM-DD') AS payment_date
         FROM transactions WHERE user_id = $1 AND description = $2`,
      [userId, "Settled groceries"],
    );
    expect(stored?.payment_date).toBe(isoDate(paidOn));

    // Turning the switch back off clears the date rather than leaving the
    // last one behind — `paymentDate` is nullable, and null is "not paid".
    await editRowAndCaptureId(page, paidRow);
    await page.getByRole("switch", { name: "Already paid" }).click();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(path("/transactions"));

    await page.goto(listUrl);
    await expect(cell(transactionRow(page, "Settled groceries"), "paymentDate")).toHaveText("Not paid");
  });

  // 14. The payment-date ceiling, enforced by the picker itself.
  test("the payment-date picker cannot reach a day after the transaction's own date", async ({
    page,
  }) => {
    await registerUser(page);
    await expect(page).toHaveURL(path("/dashboard"));
    await createCategory(page, "Groceries");

    await page.goto(path("/transactions/new"));
    await pickDate(page, "Date", previousMonthDay(10));
    await page.getByRole("switch", { name: "Already paid" }).click();

    await page.getByRole("button", { name: "Payment date", exact: true }).click();
    await expect(dayButton(page, previousMonthDay(9))).toBeEnabled();
    await expect(dayButton(page, previousMonthDay(10))).toBeEnabled();
    await expect(dayButton(page, previousMonthDay(11))).toBeDisabled();

    // Unreachable, not merely unselectable: `maxDate` feeds `endMonth` too,
    // so there is no paging forward to find an allowed later day. Without
    // that half, a user would be free to browse months of dead calendar.
    await expect(page.getByRole("button", { name: "Go to the Next Month" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  // 15. The transaction-date ceiling, enforced by the picker itself.
  test("the Date picker cannot reach a day after today", async ({ page }) => {
    await registerUser(page);
    await expect(page).toHaveURL(path("/dashboard"));
    await createCategory(page, "Groceries");

    await page.goto(path("/transactions/new"));
    await page.getByRole("button", { name: "Date", exact: true }).click();

    await expect(dayButton(page, today())).toBeEnabled();

    // A one-off records something that has already happened, so `maxDate` is
    // today — the same ceiling `createTransactionSchema` puts on `date`.
    const tomorrow = daysFromToday(1);
    if (tomorrow.getMonth() === today().getMonth()) {
      await expect(dayButton(page, tomorrow)).toBeDisabled();
    } else {
      // On the last day of a month tomorrow falls in the next one, which
      // `endMonth` makes unreachable — there is no button to disable.
      await expect(dayButton(page, tomorrow)).toHaveCount(0);
    }

    // Unreachable, not merely unselectable, exactly as for the payment-date
    // picker above: `maxDate` feeds `endMonth` as well as `disabled`.
    await expect(page.getByRole("button", { name: "Go to the Next Month" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );

    // Nothing here submits, so there is no row count worth asserting: with
    // the picker capped there is no longer any way to *choose* a future date
    // on this form. The submit-time half of the same rule — a future date
    // that reaches the action anyway — is the scenario immediately below.
  });

  // 16. The same ceiling, past the form entirely.
  test("a future date posted past the form is refused server-side", async ({ page }) => {
    const email = uniqueEmail("future-date-bypass");
    await registerUser(page, { email });
    await expect(page).toHaveURL(path("/dashboard"));
    await createCategory(page, "Groceries");
    const userId = await getUserIdByEmail(email);
    const before = await countTransactions(userId);

    // The Date field keeps the form's own default, today — so today's ISO
    // string appears exactly once in the body (the payment date is null),
    // and the swap lands on `date` and nothing else.
    const tampered = await tamperServerActionBody(
      page,
      path("/transactions/new"),
      todayIso(),
      FUTURE_DATE,
    );

    await page.goto(path("/transactions/new"));
    await amountField(page).fill("10.00");
    await selectCombobox(page, "Category", "Groceries");
    await page.getByRole("button", { name: "Create transaction" }).click();

    await expect(page.locator("form").getByRole("alert")).toHaveText(INVALID_INPUT);
    expect(tampered()).toBe(true);
    expect(await countTransactions(userId)).toBe(before);
  });

  test("a payment date after the transaction date, posted past the form, is refused server-side", async ({
    page,
  }) => {
    const email = uniqueEmail("payment-after-bypass");
    await registerUser(page, { email });
    await expect(page).toHaveURL(path("/dashboard"));
    await createCategory(page, "Groceries");
    const userId = await getUserIdByEmail(email);
    const before = await countTransactions(userId);

    const transactionDate = previousMonthDay(10);
    const paidOn = previousMonthDay(9);
    // Still in the past, so `paymentDate.notInFuture` cannot be what refuses
    // this — `paymentDateNotAfterDate` is the only rule left, which is the
    // one under test.
    const dayAfterTransaction = previousMonthDay(11);

    const tampered = await tamperServerActionBody(
      page,
      path("/transactions/new"),
      isoDate(paidOn),
      isoDate(dayAfterTransaction),
    );

    await page.goto(path("/transactions/new"));
    await amountField(page).fill("10.00");
    await selectCombobox(page, "Category", "Groceries");
    await pickDate(page, "Date", transactionDate);
    await page.getByRole("switch", { name: "Already paid" }).click();
    await pickDate(page, "Payment date", paidOn, { openOn: transactionDate });
    await page.getByRole("button", { name: "Create transaction" }).click();

    await expect(page.locator("form").getByRole("alert")).toHaveText(INVALID_INPUT);
    expect(tampered()).toBe(true);
    expect(await countTransactions(userId)).toBe(before);
  });

  test("a future payment date posted past the form is refused server-side", async ({ page }) => {
    const email = uniqueEmail("future-payment-bypass");
    await registerUser(page, { email });
    await expect(page).toHaveURL(path("/dashboard"));
    await createCategory(page, "Groceries");
    const userId = await getUserIdByEmail(email);
    const before = await countTransactions(userId);

    const transactionDate = previousMonthDay(10);
    const paidOn = previousMonthDay(9);

    const tampered = await tamperServerActionBody(
      page,
      path("/transactions/new"),
      isoDate(paidOn),
      FUTURE_DATE,
    );

    await page.goto(path("/transactions/new"));
    await amountField(page).fill("10.00");
    await selectCombobox(page, "Category", "Groceries");
    await pickDate(page, "Date", transactionDate);
    await page.getByRole("switch", { name: "Already paid" }).click();
    await pickDate(page, "Payment date", paidOn, { openOn: transactionDate });
    await page.getByRole("button", { name: "Create transaction" }).click();

    await expect(page.locator("form").getByRole("alert")).toHaveText(INVALID_INPUT);
    expect(tampered()).toBe(true);
    expect(await countTransactions(userId)).toBe(before);
  });
});
