# Transaction Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship one-off, recurring, and installment transactions — created, listed in a single filterable/sortable/paginated union table, edited, and soft-deleted — after moving the app's feature routes out from under `/dashboard`.

**Architecture:** Server Components render the list; a single raw `UNION ALL` query merges `Transaction` rows and `RecurringTransaction` definitions into one ordered, paginated page. All list state (filters, sort, page) lives in `searchParams` and is parsed by a zod schema that falls back to defaults rather than erroring. Mutations are Server Actions taking the active locale as their last argument. Category and card pickers are a reusable async combobox fed by two new Route Handlers.

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, Prisma 7 + Postgres (`@prisma/adapter-pg`), next-intl 4, zod 4, react-hook-form 7, shadcn `base-vega` on Base UI, Tailwind 4, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-16-transactions-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **Read the Next docs before writing route code.** `node_modules/next/dist/docs/` — this Next version differs from training data. `params` and `searchParams` are **Promises** and must be awaited.
- **No user-readable string in a component.** Copy lives in `messages/<locale>.json`; all three of `en-US`, `pt-BR`, `de-DE` change in the same commit. This includes `aria-label`, `title`, and `sr-only` text. (`.claude/rules/i18n.md`)
- **Navigation imports come from `@/i18n/navigation`**, never `next/link` / `next/navigation`. `href` stays locale-free.
- **A Server Action cannot resolve its own locale.** Every action takes `locale: string` as its last argument and calls `getTranslations({ locale, namespace })`. Validate it with `hasLocale`, falling back to `routing.defaultLocale`. Never read the `NEXT_LOCALE` cookie for this.
- **Zod is the only validation tool**, version 4 (`z.email()` is top-level). Schemas are factories taking a translator, defined once in `src/lib/validations/` and used by both client and server. Every string field gets an explicit `.min()` and `.max()`.
- **Ownership is re-derived from the session on every action.** Never trust a client-supplied id. Not-found and not-yours return the same generic error.
- **Delete is always soft** — set `deactivatedAt`, never `prisma.*.delete`.
- **Money is `Decimal(12, 2)`.** Amounts travel as strings end-to-end; never parse one into a float for storage.
- **Dates are calendar dates at UTC midnight.** Write with `toUtcMidnight`, read/format from UTC parts.
- **Always use shadcn components** (`base-vega` preset) rather than native or hand-rolled controls.
- **Icons are `size-6` in feature UI**, `size-4` for chrome. Any new "every descendant svg" CSS rule must carry the `:not([class*='size-'])` guard. (`.claude/rules/ui.md`)
- **Forms are `grid grid-cols-12 gap-4`**, never `flex flex-col`. Text inputs get `lg:h-11 lg:text-base`. A `register()`-ed input gets an explicit `defaultValue`.
- **Every route inside the app shell ships a `loading.tsx`** with a skeleton mirroring that page's real layout.
- **Commit format:** `<type>(<subject>): <short description>`, imperative, no trailing period, kebab-case subject. (`.claude/rules/commit-guideline.md`)
- **Verify before claiming done.** `npm run lint`, `npx tsc --noEmit`, and `npm test` must pass before every commit; `npm run test:e2e` before the final one.

**Execution order:** tasks run in numeric order with one exception — **Task 20 runs before Task 18**, because the table imports the row-actions component and nothing in row actions depends on the table.

---

## File Structure

**Phase 0 — route move (Task 1)**

| Path | Responsibility |
|---|---|
| `src/app/[locale]/(app)/layout.tsx` | Moved from `dashboard/layout.tsx`; the sidebar shell for every signed-in route |
| `src/app/[locale]/(app)/dashboard/**` | Dashboard page only (its own `loading.tsx` moves too) |
| `src/app/[locale]/(app)/categories/**` | Moved from `dashboard/categories/**` |
| `src/app/[locale]/(app)/cards/**` | Moved from `dashboard/cards/**` |
| `src/proxy.ts` | `PROTECTED_PATHS` becomes a prefix check over four paths |

**New library code**

| Path | Responsibility |
|---|---|
| `src/lib/dates.ts` | UTC calendar-date arithmetic: `toUtcMidnight`, `toIsoDate`, `addDaysUtc`, `addMonthsUtc` |
| `src/lib/format.ts` | Display formatting from user preferences: `formatMoney`, `formatDate` |
| `src/lib/transactions/occurrences.ts` | `occurrenceDates` — the date series for an installment plan |
| `src/lib/transactions/list-query.ts` | The raw `UNION ALL` builder and its typed fetch |
| `src/lib/validations/transaction.ts` | One-off schema + shared bounds/constants |
| `src/lib/validations/recurring-transaction.ts` | Ongoing recurrence schema |
| `src/lib/validations/installment.ts` | Installment plan + series schemas |
| `src/lib/validations/transaction-filters.ts` | `searchParams` parsing and query-string building |
| `src/lib/actions/transactions.ts` | One-off create/update/delete |
| `src/lib/actions/recurring-transactions.ts` | Ongoing recurrence create/update/delete |
| `src/lib/actions/installments.ts` | Plan create (with generation), series update, cascade delete |
| `src/app/api/categories/options/route.ts` | Paged, searchable category options |
| `src/app/api/cards/options/route.ts` | Paged, searchable card options |

**New components**

| Path | Responsibility |
|---|---|
| `src/components/ui/async-combobox.tsx` | Debounced, paged, searchable remote select |
| `src/components/ui/date-picker.tsx` | `Calendar` in a `Popover`, labelled through `formatDate` |
| `src/components/transactions/new-transaction-menu.tsx` | The three-item create dropdown |
| `src/components/transactions/transaction-table.tsx` | The union table, sort headers, empty states |
| `src/components/transactions/transaction-row-actions.tsx` | Per-row edit/delete menu + delete dialog |
| `src/components/transactions/transaction-filters.tsx` | Collapsible filter panel |
| `src/components/transactions/transaction-pagination.tsx` | Page links preserving other params |
| `src/components/transactions/transaction-form.tsx` | One-off create/edit form |
| `src/components/transactions/recurring-transaction-form.tsx` | Ongoing recurrence form |
| `src/components/transactions/installment-form.tsx` | Plan create form with span preview |
| `src/components/transactions/installment-series-form.tsx` | Series-level fields on the plan edit page |
| `src/components/transactions/installment-occurrences-table.tsx` | Per-occurrence inline editing |

**New routes** — each with a sibling `loading.tsx`: `/transactions`, `/transactions/new`, `/transactions/[id]/edit`, `/transactions/recurring/new`, `/transactions/recurring/[id]/edit`, `/transactions/installments/new`, `/transactions/installments/[id]/edit`.

---

## Task 1: Move feature routes out of `/dashboard`

**Files:**
- Move: `src/app/[locale]/dashboard/layout.tsx` → `src/app/[locale]/(app)/layout.tsx`
- Move: `src/app/[locale]/dashboard/{page,loading}.tsx` → `src/app/[locale]/(app)/dashboard/{page,loading}.tsx`
- Move: `src/app/[locale]/dashboard/categories/**` → `src/app/[locale]/(app)/categories/**`
- Move: `src/app/[locale]/dashboard/cards/**` → `src/app/[locale]/(app)/cards/**`
- Modify: `src/proxy.ts:11-15,85`
- Modify: `src/components/nav/dashboard-nav-menu.tsx:19-62`
- Modify: `src/lib/actions/categories.ts:145,185,205`, `src/lib/actions/cards.ts:91,119,138`
- Modify: `src/components/categories/category-form.tsx:80`, `category-row-actions.tsx:103`
- Modify: `src/components/cards/card-form.tsx:84`, `card-row-actions.tsx:92`
- Test: `e2e/categories.spec.ts`, `e2e/cards.spec.ts`, `e2e/route-protection.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: the routes `/categories`, `/cards` (and later `/transactions`) live at the top level under the `(app)` route group, which supplies the sidebar shell. `/dashboard` still exists as a leaf route, so sign-in/sign-up redirects are unchanged.

- [ ] **Step 1: Read the route-group and page conventions**

Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route-groups.md`. Confirm a `(group)` folder adds no URL segment, and that routes in different groups must not resolve to the same path.

- [ ] **Step 2: Update the e2e paths first, and watch them fail**

In `e2e/categories.spec.ts` and `e2e/cards.spec.ts`, replace every `path("/dashboard/categories…")` with `path("/categories…")` and every `path("/dashboard/cards…")` with `path("/cards…")`.

In `e2e/route-protection.spec.ts`, add a case proving the moved route is guarded:

```ts
test("redirects a signed-out visitor from /categories to login", async ({ page }) => {
  await page.goto(path("/categories"));
  await expect(page).toHaveURL(new RegExp(`${path("/login")}$`));
});
```

- [ ] **Step 3: Run the e2e suite to verify the new paths 404**

Run: `npm run test:e2e -- categories.spec.ts route-protection.spec.ts`
Expected: FAIL — `/en-US/categories` does not exist yet.

- [ ] **Step 4: Move the files with git**

```bash
git mv "src/app/[locale]/dashboard" "src/app/[locale]/(app)"
mkdir "src/app/[locale]/(app)/dashboard"
git mv "src/app/[locale]/(app)/page.tsx" "src/app/[locale]/(app)/dashboard/page.tsx"
git mv "src/app/[locale]/(app)/loading.tsx" "src/app/[locale]/(app)/dashboard/loading.tsx"
```

`(app)/layout.tsx` stays where it landed — it is now the shell for the whole group.

- [ ] **Step 5: Rewrite every `/dashboard/...` reference**

`src/proxy.ts` — replace the exact-match list and its use:

```ts
/**
 * Path prefixes that require a session, written without their locale prefix.
 * A prefix check, not equality: `/cards/new` and `/cards/abc/edit` must be
 * guarded by the same entry that guards `/cards`.
 */
const PROTECTED_PATHS = ["/dashboard", "/categories", "/cards", "/transactions"];

function isProtected(path: string) {
  return PROTECTED_PATHS.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}
```

and at line 85: `if (!isProtected(path)) return response;`

`src/components/nav/dashboard-nav-menu.tsx` — the two prefix checks and the two hrefs:

```ts
const isCategoriesActive = pathname.startsWith("/categories");
const isCardsActive = pathname.startsWith("/cards");
```
```tsx
render={<Link href="/categories" />}
render={<Link href="/cards" />}
```

Then, across the app, replace:

| Old | New |
|---|---|
| `revalidatePath("/[locale]/dashboard/categories", "page")` | `revalidatePath("/[locale]/categories", "page")` |
| `revalidatePath("/[locale]/dashboard/cards", "page")` | `revalidatePath("/[locale]/cards", "page")` |
| `router.replace("/dashboard/categories")` | `router.replace("/categories")` |
| `router.replace("/dashboard/cards")` | `router.replace("/cards")` |
| `href="/dashboard/categories…"` | `href="/categories…"` |
| `href="/dashboard/cards…"` | `href="/cards…"` |
| `PageProps<"/[locale]/dashboard/categories/[id]/edit">` | `PageProps<"/[locale]/categories/[id]/edit">` |
| `PageProps<"/[locale]/dashboard/cards/[id]/edit">` | `PageProps<"/[locale]/cards/[id]/edit">` |

Leave `redirect({ href: "/dashboard", locale })` in the auth pages, `callbackURL: '/${locale}/dashboard'` in `GoogleButton`, and `router.replace("/dashboard")` in the login/register forms untouched — `/dashboard` still exists.

Find any stragglers:

```bash
grep -rn "/dashboard/" src e2e --include=*.ts --include=*.tsx | grep -v "^src/generated"
```

Expected after the edit: no matches.

- [ ] **Step 6: Typecheck, lint, unit tests**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all pass. `PageProps` is generated from the route tree, so a missed path shows up here as a type error.

- [ ] **Step 7: Run the e2e suite**

Run: `npm run test:e2e`
Expected: PASS, including the new route-protection case.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(routes): move feature routes out of the dashboard path"
```

---

## Task 2: Add `fixedOccurrencesCount` to `RecurringTransaction`

**Files:**
- Modify: `prisma/schema.prisma:161-201`
- Create: `prisma/migrations/<timestamp>_add_fixed_occurrences_count/migration.sql` (generated)

**Interfaces:**
- Consumes: nothing.
- Produces: `RecurringTransaction.fixedOccurrencesCount: boolean` (default `false`) — `true` marks a closed, eagerly-generated installment plan; `false` an ongoing recurrence. Every later task branches on it.

- [ ] **Step 1: Read the database conventions**

Read `.claude/rules/database.md`. Note: `@map("snake_case")` on every multi-word field, no exceptions.

- [ ] **Step 2: Add the field**

In `model RecurringTransaction`, immediately above `occurrencesCount`:

```prisma
  // True when the whole series was generated eagerly at creation and the
  // recurrence is closed: `occurrencesCount` is then the final total and
  // `nextRunDate` stays null. False for an ongoing recurrence, which
  // carries a `nextRunDate` for the cron to pick up.
  fixedOccurrencesCount Boolean @default(false) @map("fixed_occurrences_count")
```

Update the two existing comments so they point at the new flag:

```prisma
  // Total transactions generated so far for this recurring definition.
  // Ongoing (`fixedOccurrencesCount = false`): incremented by a cron job
  // each time it generates one.
  // Installment plan (`fixedOccurrencesCount = true`): set once to the final
  // total when all rows are generated eagerly at creation, never incremented.
  occurrencesCount Int       @default(0) @map("occurrences_count")
  // Cron scheduling cue. Only ever set when `fixedOccurrencesCount` is false;
  // stays null for installment plans, which have nothing left to generate.
  nextRunDate      DateTime? @map("next_run_date")
```

- [ ] **Step 3: Create and apply the migration**

```bash
npx prisma migrate dev --name add_fixed_occurrences_count
```

Expected: a new migration folder, and `prisma generate` re-runs into `src/generated/prisma`.

- [ ] **Step 4: Verify the generated client sees the field**

Run: `npx tsc --noEmit`
Then confirm the column exists on the model type:

```bash
grep -n "fixedOccurrencesCount" src/generated/prisma/models/RecurringTransaction.ts | head -3
```

Expected: matches found.

- [ ] **Step 5: Commit**

```bash
git add prisma src/generated
git commit -m "feat(transactions): add fixed-occurrences flag to recurring transactions"
```

---

## Task 3: UTC calendar-date helpers

**Files:**
- Create: `src/lib/dates.ts`
- Test: `src/lib/dates.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `toUtcMidnight(value: string | Date): Date` — a `YYYY-MM-DD` string or `Date` to that calendar day at `00:00:00.000Z`
  - `toIsoDate(date: Date): string` — `YYYY-MM-DD` from UTC parts
  - `addDaysUtc(date: Date, days: number): Date`
  - `addMonthsUtc(start: Date, months: number): Date` — clamps to the last day of the target month
  - `ISO_DATE_PATTERN: RegExp`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/dates.spec.ts`:

```ts
import { describe, expect, it } from "vitest";

import { addDaysUtc, addMonthsUtc, toIsoDate, toUtcMidnight } from "@/lib/dates";

describe("toUtcMidnight", () => {
  it("parses a YYYY-MM-DD string as that day at UTC midnight", () => {
    expect(toUtcMidnight("2026-08-14").toISOString()).toBe("2026-08-14T00:00:00.000Z");
  });

  it("strips the time from a Date without shifting the calendar day", () => {
    expect(toUtcMidnight(new Date("2026-08-14T23:45:12.000Z")).toISOString()).toBe(
      "2026-08-14T00:00:00.000Z",
    );
  });
});

describe("toIsoDate", () => {
  it("renders UTC parts, zero-padded", () => {
    expect(toIsoDate(new Date("2026-01-05T00:00:00.000Z"))).toBe("2026-01-05");
  });

  // A local-time implementation returns 2025-12-31 here for anyone west of
  // UTC. Reading UTC parts is what keeps a stored date on its own day.
  it("does not shift a date backwards near midnight", () => {
    expect(toIsoDate(new Date("2026-01-01T00:00:00.000Z"))).toBe("2026-01-01");
  });
});

describe("addDaysUtc", () => {
  it("crosses a month boundary", () => {
    expect(toIsoDate(addDaysUtc(toUtcMidnight("2026-01-30"), 7))).toBe("2026-02-06");
  });
});

describe("addMonthsUtc", () => {
  it("keeps the day of month when the target month is long enough", () => {
    expect(toIsoDate(addMonthsUtc(toUtcMidnight("2026-01-15"), 2))).toBe("2026-03-15");
  });

  // Anchored on the start date, not on the previous result: rolling forward
  // month by month would give Feb 28 -> Mar 28 and drift the whole series.
  it("clamps to the last day of a shorter target month", () => {
    expect(toIsoDate(addMonthsUtc(toUtcMidnight("2026-01-31"), 1))).toBe("2026-02-28");
    expect(toIsoDate(addMonthsUtc(toUtcMidnight("2026-01-31"), 2))).toBe("2026-03-31");
    expect(toIsoDate(addMonthsUtc(toUtcMidnight("2026-01-31"), 3))).toBe("2026-04-30");
  });

  it("clamps to February 29 in a leap year", () => {
    expect(toIsoDate(addMonthsUtc(toUtcMidnight("2028-01-31"), 1))).toBe("2028-02-29");
  });

  it("rolls the year over", () => {
    expect(toIsoDate(addMonthsUtc(toUtcMidnight("2026-11-30"), 3))).toBe("2027-02-28");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/dates.spec.ts`
Expected: FAIL — cannot resolve `@/lib/dates`.

- [ ] **Step 3: Implement**

Create `src/lib/dates.ts`:

```ts
/**
 * Calendar-date arithmetic in UTC.
 *
 * `Transaction.date` and `RecurringTransaction.startDate` are `DateTime`
 * columns holding what users think of as plain calendar dates. Doing the
 * arithmetic in local time would move a date across a day boundary for
 * anyone not on UTC — a transaction entered on the 1st showing up on the
 * 31st of the month before. Everything here reads and writes UTC parts only.
 */

/** `YYYY-MM-DD`, the wire format for every date field in this app. */
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function toUtcMidnight(value: string | Date): Date {
  const date = typeof value === "string" ? new Date(`${value}T00:00:00.000Z`) : value;
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0),
  );
}

export function toIsoDate(date: Date): string {
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDaysUtc(date: Date, days: number): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days, 0, 0, 0, 0),
  );
}

/**
 * Always anchored on `start`'s day of month, never on the previous result.
 * Stepping month by month from a clamped value drifts the series: Jan 31
 * would give Feb 28, then Mar 28, then Apr 28. Anchoring gives Feb 28,
 * Mar 31, Apr 30 — the dates a monthly plan starting on the 31st means.
 */
export function addMonthsUtc(start: Date, months: number): Date {
  const targetMonthIndex = start.getUTCMonth() + months;
  const year = start.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
  const month = ((targetMonthIndex % 12) + 12) % 12;
  // Day 0 of the following month is the last day of this one.
  const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(start.getUTCDate(), lastDayOfMonth), 0, 0, 0, 0));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/dates.spec.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dates.ts src/lib/dates.spec.ts
git commit -m "feat(transactions): add UTC calendar-date helpers"
```

---

## Task 4: Money and date display formatting

**Files:**
- Create: `src/lib/format.ts`
- Test: `src/lib/format.spec.ts`

**Interfaces:**
- Consumes: `toIsoDate` from `@/lib/dates`.
- Produces:
  - `type UserFormatPreferences = { currency: string; numberFormat: NumberFormat; dateFormat: DateFormat }`
  - `formatMoney(amount: string | number, preferences: Pick<UserFormatPreferences, "currency" | "numberFormat">): string` — formats the value as given; callers prefix their own sign
  - `formatDate(date: Date, dateFormat: DateFormat): string`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/format.spec.ts`:

```ts
import { describe, expect, it } from "vitest";

import { toUtcMidnight } from "@/lib/dates";
import { formatDate, formatMoney } from "@/lib/format";

describe("formatMoney", () => {
  // Asserted by separator, not by full string equality: the currency symbol's
  // placement and spacing come from ICU and shift between Node versions.
  // The separators are the part this function actually decides.
  it("groups with commas and points with a dot for COMMA_DOT", () => {
    expect(formatMoney("1234.56", { currency: "USD", numberFormat: "COMMA_DOT" })).toContain(
      "1,234.56",
    );
  });

  it("groups with dots and points with a comma for DOT_COMMA", () => {
    expect(formatMoney("1234.56", { currency: "BRL", numberFormat: "DOT_COMMA" })).toContain(
      "1.234,56",
    );
  });

  it("always shows two decimal places", () => {
    expect(formatMoney("40", { currency: "USD", numberFormat: "COMMA_DOT" })).toContain("40.00");
  });

  it("renders the requested currency, not a fixed one", () => {
    const euros = formatMoney("10", { currency: "EUR", numberFormat: "COMMA_DOT" });
    expect(euros).toMatch(/€|EUR/);
  });

  it("accepts the string Prisma returns for a Decimal column", () => {
    expect(formatMoney("9999999999.99", { currency: "USD", numberFormat: "COMMA_DOT" })).toContain(
      "9,999,999,999.99",
    );
  });
});

describe("formatDate", () => {
  const date = toUtcMidnight("2026-08-14");

  it("renders MDY", () => {
    expect(formatDate(date, "MDY")).toBe("08/14/2026");
  });

  it("renders DMY", () => {
    expect(formatDate(date, "DMY")).toBe("14/08/2026");
  });

  it("renders YMD", () => {
    expect(formatDate(date, "YMD")).toBe("2026-08-14");
  });

  // The stored value is UTC midnight; a local-time formatter would render
  // the previous day for anyone west of UTC.
  it("reads UTC parts, so a UTC-midnight value keeps its day", () => {
    expect(formatDate(new Date("2026-01-01T00:00:00.000Z"), "YMD")).toBe("2026-01-01");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/format.spec.ts`
Expected: FAIL — cannot resolve `@/lib/format`.

- [ ] **Step 3: Implement**

Create `src/lib/format.ts`:

```ts
import type { DateFormat, NumberFormat } from "@/generated/prisma/enums";

import { toIsoDate } from "@/lib/dates";

export type UserFormatPreferences = {
  currency: string;
  numberFormat: NumberFormat;
  dateFormat: DateFormat;
};

/**
 * Formatting follows the user's stored preferences, not the UI language:
 * switching the interface to Portuguese must not silently restyle someone's
 * money. These two locales are used only as carriers for their separator
 * conventions — nothing else about them reaches the output.
 */
const NUMBER_FORMAT_LOCALE: Record<NumberFormat, string> = {
  COMMA_DOT: "en-US", // 1,234.56
  DOT_COMMA: "de-DE", // 1.234,56
};

/**
 * Formats the value exactly as given. The sign is the caller's business: the
 * transactions table prefixes "+" or "−" from the row's `type`, because an
 * expense is stored as a positive amount with `type: "EXPENSE"`, not as a
 * negative number.
 */
export function formatMoney(
  amount: string | number,
  preferences: Pick<UserFormatPreferences, "currency" | "numberFormat">,
): string {
  return new Intl.NumberFormat(NUMBER_FORMAT_LOCALE[preferences.numberFormat], {
    style: "currency",
    currency: preferences.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount));
}

export function formatDate(date: Date, dateFormat: DateFormat): string {
  const iso = toIsoDate(date);
  const [year, month, day] = iso.split("-");

  switch (dateFormat) {
    case "MDY":
      return `${month}/${day}/${year}`;
    case "DMY":
      return `${day}/${month}/${year}`;
    case "YMD":
      return iso;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/format.spec.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.ts src/lib/format.spec.ts
git commit -m "feat(transactions): format money and dates from user preferences"
```

---

## Task 5: Installment occurrence dates

**Files:**
- Create: `src/lib/transactions/occurrences.ts`
- Test: `src/lib/transactions/occurrences.spec.ts`

**Interfaces:**
- Consumes: `addDaysUtc`, `addMonthsUtc`, `toUtcMidnight` from `@/lib/dates`.
- Produces:
  - `MAX_INSTALLMENT_OCCURRENCES = 100`
  - `RECURRING_FREQUENCIES: readonly ["DAILY","WEEKLY","BIWEEKLY","MONTHLY","QUARTERLY","SEMIANNUAL","YEARLY"]`
  - `type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number]`
  - `occurrenceDates(start: string | Date, frequency: RecurringFrequency, count: number): Date[]` — `count` dates at UTC midnight, the first being `start`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/transactions/occurrences.spec.ts`:

```ts
import { describe, expect, it } from "vitest";

import { toIsoDate } from "@/lib/dates";
import { MAX_INSTALLMENT_OCCURRENCES, occurrenceDates } from "@/lib/transactions/occurrences";

const iso = (start: string, frequency: Parameters<typeof occurrenceDates>[1], count: number) =>
  occurrenceDates(start, frequency, count).map(toIsoDate);

describe("occurrenceDates", () => {
  it("starts on the start date itself", () => {
    expect(iso("2026-01-05", "MONTHLY", 3)[0]).toBe("2026-01-05");
  });

  it("returns exactly `count` dates", () => {
    expect(occurrenceDates("2026-01-05", "MONTHLY", 12)).toHaveLength(12);
  });

  it("steps DAILY by one day", () => {
    expect(iso("2026-01-30", "DAILY", 3)).toEqual(["2026-01-30", "2026-01-31", "2026-02-01"]);
  });

  it("steps WEEKLY by seven days", () => {
    expect(iso("2026-01-01", "WEEKLY", 3)).toEqual(["2026-01-01", "2026-01-08", "2026-01-15"]);
  });

  it("steps BIWEEKLY by fourteen days", () => {
    expect(iso("2026-01-01", "BIWEEKLY", 3)).toEqual(["2026-01-01", "2026-01-15", "2026-01-29"]);
  });

  it("steps MONTHLY by one month", () => {
    expect(iso("2026-01-05", "MONTHLY", 3)).toEqual(["2026-01-05", "2026-02-05", "2026-03-05"]);
  });

  it("steps QUARTERLY by three months", () => {
    expect(iso("2026-01-05", "QUARTERLY", 3)).toEqual(["2026-01-05", "2026-04-05", "2026-07-05"]);
  });

  it("steps SEMIANNUAL by six months", () => {
    expect(iso("2026-01-05", "SEMIANNUAL", 3)).toEqual(["2026-01-05", "2026-07-05", "2027-01-05"]);
  });

  it("steps YEARLY by twelve months", () => {
    expect(iso("2026-01-05", "YEARLY", 3)).toEqual(["2026-01-05", "2027-01-05", "2028-01-05"]);
  });

  // The whole point of anchoring in addMonthsUtc: a plan started on the 31st
  // returns to the 31st whenever the month has one.
  it("clamps short months without drifting the series", () => {
    expect(iso("2026-01-31", "MONTHLY", 4)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  it("normalizes the start to UTC midnight", () => {
    expect(occurrenceDates(new Date("2026-01-05T18:30:00.000Z"), "MONTHLY", 1)[0].toISOString()).toBe(
      "2026-01-05T00:00:00.000Z",
    );
  });

  it("returns an empty array for a count of zero", () => {
    expect(occurrenceDates("2026-01-05", "MONTHLY", 0)).toEqual([]);
  });

  // The bound is enforced by the schema too; this is the last line of defence
  // before an unbounded number of rows is written.
  it("refuses a count above the maximum", () => {
    expect(() => occurrenceDates("2026-01-05", "MONTHLY", MAX_INSTALLMENT_OCCURRENCES + 1)).toThrow();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/transactions/occurrences.spec.ts`
Expected: FAIL — cannot resolve `@/lib/transactions/occurrences`.

- [ ] **Step 3: Implement**

Create `src/lib/transactions/occurrences.ts`:

```ts
import { addDaysUtc, addMonthsUtc, toUtcMidnight } from "@/lib/dates";

/**
 * Hard ceiling on how many rows one installment plan may generate. Eager
 * generation is unbounded work driven by a user-supplied number, so it needs
 * a bound that does not depend on the form validating first. 100 monthly
 * occurrences is already more than eight years.
 */
export const MAX_INSTALLMENT_OCCURRENCES = 100;

/** Mirrors the Prisma `RecurringFrequency` enum. */
export const RECURRING_FREQUENCIES = [
  "DAILY",
  "WEEKLY",
  "BIWEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "SEMIANNUAL",
  "YEARLY",
] as const;

export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];

/** Days for the fixed-length steps; months for the calendar-aware ones. */
const DAY_STEP: Partial<Record<RecurringFrequency, number>> = {
  DAILY: 1,
  WEEKLY: 7,
  BIWEEKLY: 14,
};

const MONTH_STEP: Partial<Record<RecurringFrequency, number>> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMIANNUAL: 6,
  YEARLY: 12,
};

/**
 * The full date series for an installment plan, first occurrence on the start
 * date itself. Every date is UTC midnight.
 */
export function occurrenceDates(
  start: string | Date,
  frequency: RecurringFrequency,
  count: number,
): Date[] {
  if (count > MAX_INSTALLMENT_OCCURRENCES) {
    throw new Error(`occurrenceDates: count ${count} exceeds ${MAX_INSTALLMENT_OCCURRENCES}`);
  }

  const first = toUtcMidnight(start);
  const days = DAY_STEP[frequency];
  const months = MONTH_STEP[frequency];

  return Array.from({ length: Math.max(count, 0) }, (_unused, index) =>
    days === undefined ? addMonthsUtc(first, months! * index) : addDaysUtc(first, days * index),
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/transactions/occurrences.spec.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/transactions/occurrences.ts src/lib/transactions/occurrences.spec.ts
git commit -m "feat(transactions): compute installment occurrence dates"
```

---

## Task 6: Transaction, recurrence, and installment schemas

**Files:**
- Create: `src/lib/validations/transaction.ts`
- Create: `src/lib/validations/recurring-transaction.ts`
- Create: `src/lib/validations/installment.ts`
- Test: `src/lib/validations/transaction.spec.ts`
- Test: `src/lib/validations/installment.spec.ts`

> **Deviation from the spec, made deliberately:** the spec named three
> message namespaces (`validation.transactions`, `validation.recurringTransactions`,
> `validation.installments`). All three schemas share the same six fields, so
> three namespaces would mean the same eight messages written nine times
> across three locale files. They share **one** namespace, `validation.transactions`,
> with four extra keys for the recurrence-only and installment-only fields.

**Interfaces:**
- Consumes: `ISO_DATE_PATTERN` from `@/lib/dates`; `MAX_INSTALLMENT_OCCURRENCES`, `RECURRING_FREQUENCIES`, `RecurringFrequency` from `@/lib/transactions/occurrences`.
- Produces:
  - From `transaction.ts`: `MAX_TRANSACTION_DESCRIPTION_LENGTH = 200`, `MAX_TRANSACTION_AMOUNT = "9999999999.99"`, `TRANSACTION_ID_MAX_LENGTH = 30`, `MIN_TRANSACTION_DATE = "2000-01-01"`, `MAX_TRANSACTION_DATE = "2100-12-31"`, `TRANSACTION_TYPES`, `type TransactionType`, `type TransactionValidationKey`, `type TransactionValidationTranslator`, `sharedTransactionFields(t)`, `isoDateField(t)`, `incomeHasNoCard(t)`, `createTransactionSchema(t)`, `type TransactionValues`
  - From `recurring-transaction.ts`: `createRecurringTransactionSchema(t)`, `type RecurringTransactionValues`
  - From `installment.ts`: `createInstallmentSchema(t)`, `type InstallmentValues`, `createInstallmentSeriesSchema(t)`, `type InstallmentSeriesValues`
  - Field shapes every later task depends on: `amount` is a **string** (never a float), `date`/`startDate` are `YYYY-MM-DD` **strings**, `cardId` and `description` normalize `""`/`undefined` to `null`.

- [ ] **Step 1: Read the validation rules**

Read `.claude/rules/validation.md`. Note: zod **4** (`.min()`/`.max()` on every string, `.trim()` before `.min()`, cross-field rules use a *guarded* `superRefine`, one message per field).

- [ ] **Step 2: Write the failing tests for the one-off schema**

Create `src/lib/validations/transaction.spec.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  createTransactionSchema,
  MAX_TRANSACTION_DESCRIPTION_LENGTH,
  type TransactionValidationKey,
} from "@/lib/validations/transaction";

// Key-echoing stub, per .claude/rules/i18n.md: these tests assert which rule
// fired, not the copy, so changing an English string cannot break them.
const t = (key: TransactionValidationKey, values?: Record<string, string | number>) =>
  values ? `${key}:${JSON.stringify(values)}` : key;

const schema = createTransactionSchema(t);

const valid = {
  type: "EXPENSE" as const,
  amount: "120.50",
  categoryId: "clx0000000000000000000001",
  cardId: "clx0000000000000000000002",
  description: "Groceries",
  date: "2026-08-14",
  isPaid: true,
};

const firstIssue = (values: unknown) => {
  const result = schema.safeParse(values);
  if (result.success) throw new Error("expected the payload to fail validation");
  return result.error.issues[0];
};

describe("createTransactionSchema", () => {
  it("accepts a complete payload", () => {
    expect(schema.safeParse(valid).success).toBe(true);
  });

  describe("amount", () => {
    it("accepts a whole number and one or two decimal places", () => {
      for (const amount of ["40", "40.5", "40.55"]) {
        expect(schema.safeParse({ ...valid, amount }).success).toBe(true);
      }
    });

    it("rejects three decimal places", () => {
      expect(firstIssue({ ...valid, amount: "40.555" }).message).toBe("amount.invalid");
    });

    it("rejects a non-numeric string", () => {
      expect(firstIssue({ ...valid, amount: "twelve" }).message).toBe("amount.invalid");
    });

    it("rejects a negative amount at the pattern, before the range check", () => {
      expect(firstIssue({ ...valid, amount: "-5" }).message).toBe("amount.invalid");
    });

    it("rejects zero", () => {
      expect(firstIssue({ ...valid, amount: "0" }).message).toBe("amount.tooSmall");
    });

    it("accepts the Decimal(12, 2) ceiling and rejects one cent more", () => {
      expect(schema.safeParse({ ...valid, amount: "9999999999.99" }).success).toBe(true);
      expect(firstIssue({ ...valid, amount: "10000000000.00" }).message).toContain("amount.tooLarge");
    });
  });

  describe("category", () => {
    it("rejects an empty id", () => {
      expect(firstIssue({ ...valid, categoryId: "" }).message).toBe("category.required");
    });

    it("rejects an id longer than the bound", () => {
      expect(firstIssue({ ...valid, categoryId: "c".repeat(31) }).message).toBe("category.required");
    });
  });

  describe("card", () => {
    it("normalizes an empty string to null", () => {
      const result = schema.safeParse({ ...valid, cardId: "" });
      expect(result.success && result.data.cardId).toBeNull();
    });

    it("normalizes a missing value to null", () => {
      const { cardId: _removed, ...withoutCard } = valid;
      const result = schema.safeParse(withoutCard);
      expect(result.success && result.data.cardId).toBeNull();
    });

    // The schema's only cross-field rule, and the invariant the database
    // comment documents: cardId is null exactly when the type is INCOME.
    it("rejects a card on an income transaction, on the cardId path", () => {
      const issue = firstIssue({ ...valid, type: "INCOME" });
      expect(issue.message).toBe("card.notForIncome");
      expect(issue.path).toEqual(["cardId"]);
    });

    it("accepts income with no card", () => {
      expect(schema.safeParse({ ...valid, type: "INCOME", cardId: "" }).success).toBe(true);
    });

    // Guarded, so a payload failing the base shape produces one issue, not two.
    it("does not add the cross-field issue when the type itself is invalid", () => {
      const result = schema.safeParse({ ...valid, type: "TRANSFER" });
      expect(result.success).toBe(false);
      expect(result.success === false && result.error.issues).toHaveLength(1);
    });
  });

  describe("description", () => {
    it("accepts the maximum length and rejects one more", () => {
      const max = "d".repeat(MAX_TRANSACTION_DESCRIPTION_LENGTH);
      expect(schema.safeParse({ ...valid, description: max }).success).toBe(true);
      expect(firstIssue({ ...valid, description: `${max}d` }).message).toContain(
        "description.tooLong",
      );
    });

    it("normalizes an empty description to null", () => {
      const result = schema.safeParse({ ...valid, description: "   " });
      expect(result.success && result.data.description).toBeNull();
    });
  });

  describe("date", () => {
    it("rejects a non-ISO shape", () => {
      expect(firstIssue({ ...valid, date: "14/08/2026" }).message).toBe("date.invalid");
    });

    it("rejects a day that does not exist", () => {
      expect(firstIssue({ ...valid, date: "2026-02-31" }).message).toBe("date.invalid");
    });

    it("accepts both range boundaries and rejects outside them", () => {
      expect(schema.safeParse({ ...valid, date: "2000-01-01" }).success).toBe(true);
      expect(schema.safeParse({ ...valid, date: "2100-12-31" }).success).toBe(true);
      expect(firstIssue({ ...valid, date: "1999-12-31" }).message).toContain("date.outOfRange");
      expect(firstIssue({ ...valid, date: "2101-01-01" }).message).toContain("date.outOfRange");
    });
  });

  describe("type", () => {
    it("rejects a value outside the enum", () => {
      expect(firstIssue({ ...valid, type: "TRANSFER" }).message).toBe("type.invalid");
    });
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/lib/validations/transaction.spec.ts`
Expected: FAIL — cannot resolve `@/lib/validations/transaction`.

- [ ] **Step 4: Implement the one-off schema**

Create `src/lib/validations/transaction.ts`:

```ts
import { z } from "zod";

import { ISO_DATE_PATTERN } from "@/lib/dates";

export const MAX_TRANSACTION_DESCRIPTION_LENGTH = 200;

/**
 * The `Decimal(12, 2)` ceiling, as a string. Kept as a string so the bound,
 * the message, and the stored value are all the same lossless representation
 * — money never becomes a float on the way through this app.
 */
export const MAX_TRANSACTION_AMOUNT = "9999999999.99";

/** A `@default(cuid())` id is 25 characters; 30 leaves headroom. */
export const TRANSACTION_ID_MAX_LENGTH = 30;

/**
 * A typo'd year would otherwise write a row that sorts to one end of every
 * list forever, and no filter window would ever contain it.
 */
export const MIN_TRANSACTION_DATE = "2000-01-01";
export const MAX_TRANSACTION_DATE = "2100-12-31";

/** The only two values `Transaction.type` may hold. */
export const TRANSACTION_TYPES = ["INCOME", "EXPENSE"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

/**
 * Every message key these schemas can emit, relative to the
 * `validation.transactions` namespace. Declaring the union explicitly is what
 * lets a real `getTranslations("validation.transactions")` be passed in —
 * see the long note on `CategoryPresetTranslator` in
 * `src/lib/category-display.ts` for why a `(key: string) => string` would not
 * be assignable.
 */
export type TransactionValidationKey =
  | "amount.invalid"
  | "amount.tooSmall"
  | "amount.tooLarge"
  | "category.required"
  | "card.notForIncome"
  | "description.tooLong"
  | "type.invalid"
  | "date.invalid"
  | "date.outOfRange"
  | "frequency.invalid"
  | "occurrences.invalid"
  | "occurrences.tooMany";

export type TransactionValidationTranslator = (
  key: TransactionValidationKey,
  values?: Record<string, string | number>,
) => string;

/**
 * A `YYYY-MM-DD` field. String comparison is a correct date comparison for
 * this format, so the range check needs no parsing. The second refinement
 * catches a well-shaped but nonexistent day like `2026-02-31`, which the
 * `Date` constructor rejects as NaN under strict ISO parsing.
 */
export function isoDateField(t: TransactionValidationTranslator) {
  return z
    .string()
    .trim()
    .regex(ISO_DATE_PATTERN, t("date.invalid"))
    .refine(
      (value) => !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime()),
      t("date.invalid"),
    )
    .refine(
      (value) => value >= MIN_TRANSACTION_DATE && value <= MAX_TRANSACTION_DATE,
      t("date.outOfRange", { min: MIN_TRANSACTION_DATE, max: MAX_TRANSACTION_DATE }),
    );
}

/** The fields common to one-off transactions, recurrences, and installments. */
export function sharedTransactionFields(t: TransactionValidationTranslator) {
  return {
    type: z.enum(TRANSACTION_TYPES, t("type.invalid")),

    // Validated as a string and kept as one all the way to Prisma, which
    // accepts a string for a Decimal column. Parsing to a number here would
    // put a float between the user's input and the database.
    amount: z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,2})?$/, t("amount.invalid"))
      .refine((value) => Number(value) > 0, t("amount.tooSmall"))
      .refine(
        (value) => Number(value) <= Number(MAX_TRANSACTION_AMOUNT),
        t("amount.tooLarge", { max: MAX_TRANSACTION_AMOUNT }),
      ),

    categoryId: z
      .string()
      .trim()
      .min(1, t("category.required"))
      .max(TRANSACTION_ID_MAX_LENGTH, t("category.required")),

    // Accepts a string, null, or nothing at all, and always produces
    // `string | null` — so a cleared select and an untouched one are the
    // same value by the time anything downstream sees it.
    cardId: z
      .union([z.string().trim().max(TRANSACTION_ID_MAX_LENGTH), z.null()])
      .optional()
      .transform((value) => (value ? value : null)),

    description: z
      .string()
      .trim()
      .max(
        MAX_TRANSACTION_DESCRIPTION_LENGTH,
        t("description.tooLong", { max: MAX_TRANSACTION_DESCRIPTION_LENGTH }),
      )
      .optional()
      .transform((value) => (value ? value : null)),
  };
}

/**
 * `Transaction.cardId` is null exactly when the type is `INCOME`. Guarded, so
 * a payload that already failed the base shape does not also collect this
 * issue — `.claude/rules/validation.md`.
 */
export function incomeHasNoCard(t: TransactionValidationTranslator) {
  return (values: { type: TransactionType; cardId: string | null }, ctx: z.RefinementCtx) => {
    if (values.type === "INCOME" && values.cardId) {
      ctx.addIssue({ code: "custom", message: t("card.notForIncome"), path: ["cardId"] });
    }
  };
}

export function createTransactionSchema(t: TransactionValidationTranslator) {
  return z
    .object({
      ...sharedTransactionFields(t),
      date: isoDateField(t),
      isPaid: z.boolean(),
    })
    .superRefine(incomeHasNoCard(t));
}

export type TransactionValues = z.infer<ReturnType<typeof createTransactionSchema>>;
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run src/lib/validations/transaction.spec.ts`
Expected: PASS, 20 tests.

- [ ] **Step 6: Write the failing tests for the recurrence and installment schemas**

Create `src/lib/validations/installment.spec.ts`:

```ts
import { describe, expect, it } from "vitest";

import { MAX_INSTALLMENT_OCCURRENCES } from "@/lib/transactions/occurrences";
import { createRecurringTransactionSchema } from "@/lib/validations/recurring-transaction";
import {
  createInstallmentSchema,
  createInstallmentSeriesSchema,
} from "@/lib/validations/installment";
import type { TransactionValidationKey } from "@/lib/validations/transaction";

const t = (key: TransactionValidationKey, values?: Record<string, string | number>) =>
  values ? `${key}:${JSON.stringify(values)}` : key;

const base = {
  type: "EXPENSE" as const,
  amount: "89.00",
  categoryId: "clx0000000000000000000001",
  cardId: "clx0000000000000000000002",
  description: "Gym",
  startDate: "2026-01-05",
  frequency: "MONTHLY" as const,
};

const firstIssue = (schema: { safeParse: (v: unknown) => unknown }, values: unknown) => {
  const result = schema.safeParse(values) as
    | { success: true }
    | { success: false; error: { issues: { message: string; path: (string | number)[] }[] } };
  if (result.success) throw new Error("expected the payload to fail validation");
  return result.error.issues[0];
};

describe("createRecurringTransactionSchema", () => {
  const schema = createRecurringTransactionSchema(t);

  it("accepts a complete payload", () => {
    expect(schema.safeParse(base).success).toBe(true);
  });

  it("accepts every frequency the database allows", () => {
    for (const frequency of [
      "DAILY",
      "WEEKLY",
      "BIWEEKLY",
      "MONTHLY",
      "QUARTERLY",
      "SEMIANNUAL",
      "YEARLY",
    ]) {
      expect(schema.safeParse({ ...base, frequency }).success).toBe(true);
    }
  });

  it("rejects a frequency outside the enum", () => {
    expect(firstIssue(schema, { ...base, frequency: "FORTNIGHTLY" }).message).toBe(
      "frequency.invalid",
    );
  });

  it("applies the date range to startDate", () => {
    expect(firstIssue(schema, { ...base, startDate: "1999-12-31" }).message).toContain(
      "date.outOfRange",
    );
  });

  it("carries the income/card rule over from the shared fields", () => {
    expect(firstIssue(schema, { ...base, type: "INCOME" }).path).toEqual(["cardId"]);
  });

  it("has no occurrence count — an ongoing recurrence runs until deleted", () => {
    const result = schema.safeParse({ ...base, occurrencesCount: 12 });
    expect(result.success && "occurrencesCount" in result.data).toBe(false);
  });
});

describe("createInstallmentSchema", () => {
  const schema = createInstallmentSchema(t);

  it("accepts a plan with a count", () => {
    expect(schema.safeParse({ ...base, occurrencesCount: 12 }).success).toBe(true);
  });

  it("coerces the count from the string a number input produces", () => {
    const result = schema.safeParse({ ...base, occurrencesCount: "12" });
    expect(result.success && result.data.occurrencesCount).toBe(12);
  });

  it("accepts 1 and the maximum, and rejects 0 and one over", () => {
    expect(schema.safeParse({ ...base, occurrencesCount: 1 }).success).toBe(true);
    expect(
      schema.safeParse({ ...base, occurrencesCount: MAX_INSTALLMENT_OCCURRENCES }).success,
    ).toBe(true);
    expect(firstIssue(schema, { ...base, occurrencesCount: 0 }).message).toBe(
      "occurrences.invalid",
    );
    expect(
      firstIssue(schema, { ...base, occurrencesCount: MAX_INSTALLMENT_OCCURRENCES + 1 }).message,
    ).toContain("occurrences.tooMany");
  });

  it("rejects a fractional count", () => {
    expect(firstIssue(schema, { ...base, occurrencesCount: 2.5 }).message).toBe(
      "occurrences.invalid",
    );
  });
});

describe("createInstallmentSeriesSchema", () => {
  const schema = createInstallmentSeriesSchema(t);

  // Only the fields that classify the whole series. Amount, date, description
  // and paid belong to each occurrence and are edited row by row.
  it("accepts just type, category, and card", () => {
    expect(
      schema.safeParse({
        type: "EXPENSE",
        categoryId: "clx0000000000000000000001",
        cardId: "clx0000000000000000000002",
      }).success,
    ).toBe(true);
  });

  it("keeps the income/card rule", () => {
    const issue = firstIssue(schema, {
      type: "INCOME",
      categoryId: "clx0000000000000000000001",
      cardId: "clx0000000000000000000002",
    });
    expect(issue.message).toBe("card.notForIncome");
    expect(issue.path).toEqual(["cardId"]);
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npx vitest run src/lib/validations/installment.spec.ts`
Expected: FAIL — cannot resolve `@/lib/validations/recurring-transaction`.

- [ ] **Step 8: Implement both schemas**

Create `src/lib/validations/recurring-transaction.ts`:

```ts
import { z } from "zod";

import { RECURRING_FREQUENCIES } from "@/lib/transactions/occurrences";
import {
  incomeHasNoCard,
  isoDateField,
  sharedTransactionFields,
  type TransactionValidationTranslator,
} from "@/lib/validations/transaction";

/**
 * An ongoing recurrence: no end, no occurrence count, and no rows generated
 * at creation. `date`/`isPaid` are absent by design — those belong to a
 * concrete transaction, and this is a definition.
 */
export function createRecurringTransactionSchema(t: TransactionValidationTranslator) {
  return z
    .object({
      ...sharedTransactionFields(t),
      startDate: isoDateField(t),
      frequency: z.enum(RECURRING_FREQUENCIES, t("frequency.invalid")),
    })
    .superRefine(incomeHasNoCard(t));
}

export type RecurringTransactionValues = z.infer<
  ReturnType<typeof createRecurringTransactionSchema>
>;
```

Create `src/lib/validations/installment.ts`:

```ts
import { z } from "zod";

import { MAX_INSTALLMENT_OCCURRENCES, RECURRING_FREQUENCIES } from "@/lib/transactions/occurrences";
import {
  incomeHasNoCard,
  isoDateField,
  sharedTransactionFields,
  TRANSACTION_TYPES,
  TRANSACTION_ID_MAX_LENGTH,
  type TransactionValidationTranslator,
} from "@/lib/validations/transaction";

/**
 * A closed plan: every occurrence is generated at creation, so the count is
 * required and bounded. `MAX_INSTALLMENT_OCCURRENCES` is the same bound
 * `occurrenceDates` enforces at the last moment — this one exists to tell the
 * user, that one to make an unbounded write impossible.
 */
export function createInstallmentSchema(t: TransactionValidationTranslator) {
  return z
    .object({
      ...sharedTransactionFields(t),
      startDate: isoDateField(t),
      frequency: z.enum(RECURRING_FREQUENCIES, t("frequency.invalid")),
      occurrencesCount: z.coerce
        .number(t("occurrences.invalid"))
        .int(t("occurrences.invalid"))
        .min(1, t("occurrences.invalid"))
        .max(
          MAX_INSTALLMENT_OCCURRENCES,
          t("occurrences.tooMany", { max: MAX_INSTALLMENT_OCCURRENCES }),
        ),
    })
    .superRefine(incomeHasNoCard(t));
}

export type InstallmentValues = z.infer<ReturnType<typeof createInstallmentSchema>>;

/**
 * The series-level half of the plan edit page: the fields that classify the
 * whole series and are written to the definition *and* every occurrence.
 * Amount, date, description, and paid are edited per occurrence instead, so
 * they are deliberately absent here.
 *
 * `type` is a series field because `cardId` must be null exactly when the
 * type is `INCOME` — letting one occurrence flip to income would break that
 * invariant for the row while the series still carried a card.
 */
export function createInstallmentSeriesSchema(t: TransactionValidationTranslator) {
  return z
    .object({
      type: z.enum(TRANSACTION_TYPES, t("type.invalid")),
      categoryId: z
        .string()
        .trim()
        .min(1, t("category.required"))
        .max(TRANSACTION_ID_MAX_LENGTH, t("category.required")),
      cardId: z
        .union([z.string().trim().max(TRANSACTION_ID_MAX_LENGTH), z.null()])
        .optional()
        .transform((value) => (value ? value : null)),
    })
    .superRefine(incomeHasNoCard(t));
}

export type InstallmentSeriesValues = z.infer<ReturnType<typeof createInstallmentSeriesSchema>>;
```

- [ ] **Step 9: Run both spec files to verify they pass**

Run: `npx vitest run src/lib/validations/`
Expected: PASS — including the pre-existing `auth`, `card`, and `category` specs.

- [ ] **Step 10: Commit**

```bash
git add src/lib/validations/transaction.ts src/lib/validations/recurring-transaction.ts src/lib/validations/installment.ts src/lib/validations/transaction.spec.ts src/lib/validations/installment.spec.ts
git commit -m "feat(transactions): add transaction, recurrence, and installment schemas"
```

---

## Task 7: List filter parsing and query-string building

**Files:**
- Create: `src/lib/validations/transaction-filters.ts`
- Test: `src/lib/validations/transaction-filters.spec.ts`

**Interfaces:**
- Consumes: `toIsoDate` from `@/lib/dates`; `TRANSACTION_TYPES`, `TransactionType`, `TRANSACTION_ID_MAX_LENGTH` from `@/lib/validations/transaction`.
- Produces:
  - `PAGE_SIZE = 50`, `TRANSACTION_SHOW_VALUES`, `TRANSACTION_SORT_VALUES`, `SORT_DIRECTIONS`
  - `type TransactionShow`, `type TransactionSort`, `type SortDirection`
  - `type TransactionFilters = { from: string; to: string; categoryId: string | null; cardId: string | null; type: TransactionType | null; show: TransactionShow; sort: TransactionSort; dir: SortDirection; page: number }` (`from`/`to` are `YYYY-MM-DD`)
  - `defaultPeriod(today: Date): { from: string; to: string }`
  - `parseTransactionFilters(params: Record<string, string | string[] | undefined>, today?: Date): TransactionFilters`
  - `buildTransactionSearchParams(filters: TransactionFilters, today?: Date): URLSearchParams`
  - `clampPage(page: number, total: number): number`
  - `countActiveFilters(filters: TransactionFilters, today?: Date): number`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/validations/transaction-filters.spec.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  buildTransactionSearchParams,
  clampPage,
  countActiveFilters,
  defaultPeriod,
  PAGE_SIZE,
  parseTransactionFilters,
} from "@/lib/validations/transaction-filters";

const TODAY = new Date("2026-08-16T12:00:00.000Z");

const parse = (params: Record<string, string | string[] | undefined>) =>
  parseTransactionFilters(params, TODAY);

describe("defaultPeriod", () => {
  it("runs from day 1 of the current month to today", () => {
    expect(defaultPeriod(TODAY)).toEqual({ from: "2026-08-01", to: "2026-08-16" });
  });
});

describe("parseTransactionFilters", () => {
  it("returns every default for an empty query string", () => {
    expect(parse({})).toEqual({
      from: "2026-08-01",
      to: "2026-08-16",
      categoryId: null,
      cardId: null,
      type: null,
      show: "all",
      sort: "date",
      dir: "desc",
      page: 1,
    });
  });

  it("reads a well-formed query string", () => {
    expect(
      parse({
        from: "2026-01-01",
        to: "2026-03-31",
        category: "clx0000000000000000000001",
        card: "clx0000000000000000000002",
        type: "INCOME",
        show: "installments",
        sort: "amount",
        dir: "asc",
        page: "3",
      }),
    ).toEqual({
      from: "2026-01-01",
      to: "2026-03-31",
      categoryId: "clx0000000000000000000001",
      cardId: "clx0000000000000000000002",
      type: "INCOME",
      show: "installments",
      sort: "amount",
      dir: "asc",
      page: 3,
    });
  });

  // A URL someone was handed must render a page, not a 500.
  describe("invalid input falls back instead of throwing", () => {
    it("ignores an unknown sort", () => {
      expect(parse({ sort: "drop table" }).sort).toBe("date");
    });

    it("ignores an unknown direction", () => {
      expect(parse({ dir: "sideways" }).dir).toBe("desc");
    });

    it("ignores an unknown show value", () => {
      expect(parse({ show: "everything" }).show).toBe("all");
    });

    it("ignores an unknown type", () => {
      expect(parse({ type: "TRANSFER" }).type).toBeNull();
    });

    it("ignores an over-long id", () => {
      expect(parse({ category: "c".repeat(31) }).categoryId).toBeNull();
    });

    it("clamps a page below 1", () => {
      expect(parse({ page: "-4" }).page).toBe(1);
      expect(parse({ page: "0" }).page).toBe(1);
    });

    it("ignores a non-numeric page", () => {
      expect(parse({ page: "two" }).page).toBe(1);
    });

    it("reverts both dates when either is malformed", () => {
      expect(parse({ from: "01/01/2026", to: "2026-03-31" })).toMatchObject({
        from: "2026-08-01",
        to: "2026-08-16",
      });
    });

    // A nonexistent day is well-shaped, so the regex passes it. `new Date`
    // does not reject it either — it rolls 2026-02-31 over to March 2nd —
    // so without the round-trip check this silently filters on a date the
    // user never asked for.
    it("reverts a well-shaped but nonexistent day", () => {
      expect(parse({ from: "2026-02-31", to: "2026-03-31" })).toMatchObject({
        from: "2026-08-01",
        to: "2026-08-16",
      });
    });

    it("reverts both dates when from is after to", () => {
      expect(parse({ from: "2026-05-01", to: "2026-04-01" })).toMatchObject({
        from: "2026-08-01",
        to: "2026-08-16",
      });
    });

    it("accepts an equal from and to", () => {
      expect(parse({ from: "2026-05-01", to: "2026-05-01" })).toMatchObject({
        from: "2026-05-01",
        to: "2026-05-01",
      });
    });

    // Next gives an array when a param is repeated.
    it("takes the first value of a repeated param", () => {
      expect(parse({ sort: ["amount", "date"] }).sort).toBe("amount");
    });
  });
});

describe("buildTransactionSearchParams", () => {
  it("omits every default, so clearing filters produces a bare path", () => {
    expect(buildTransactionSearchParams(parse({}), TODAY).toString()).toBe("");
  });

  it("writes only what differs from the defaults", () => {
    const params = buildTransactionSearchParams(parse({ show: "recurring", page: "2" }), TODAY);
    expect(params.get("show")).toBe("recurring");
    expect(params.get("page")).toBe("2");
    expect(params.get("sort")).toBeNull();
    expect(params.get("from")).toBeNull();
  });

  it("round-trips a fully specified filter set", () => {
    const filters = parse({
      from: "2026-01-01",
      to: "2026-03-31",
      category: "clx0000000000000000000001",
      card: "clx0000000000000000000002",
      type: "INCOME",
      show: "single",
      sort: "category",
      dir: "asc",
      page: "4",
    });

    expect(
      parseTransactionFilters(
        Object.fromEntries(buildTransactionSearchParams(filters, TODAY)),
        TODAY,
      ),
    ).toEqual(filters);
  });
});

describe("clampPage", () => {
  it("keeps a page inside the result set", () => {
    expect(clampPage(2, PAGE_SIZE * 3)).toBe(2);
  });

  it("clamps past the last page", () => {
    expect(clampPage(999, PAGE_SIZE + 1)).toBe(2);
  });

  it("stays on page 1 for an empty result set", () => {
    expect(clampPage(3, 0)).toBe(1);
  });
});

describe("countActiveFilters", () => {
  it("counts nothing when everything is default", () => {
    expect(countActiveFilters(parse({}), TODAY)).toBe(0);
  });

  // Sort, direction, and page are not filters — they must not inflate the
  // badge on the filter panel's trigger.
  it("ignores sort, direction, and page", () => {
    expect(countActiveFilters(parse({ sort: "amount", dir: "asc", page: "5" }), TODAY)).toBe(0);
  });

  it("counts a changed period once, not twice", () => {
    expect(countActiveFilters(parse({ from: "2026-01-01", to: "2026-03-31" }), TODAY)).toBe(1);
  });

  it("counts each non-default filter", () => {
    expect(
      countActiveFilters(
        parse({ category: "clx0000000000000000000001", type: "INCOME", show: "single" }),
        TODAY,
      ),
    ).toBe(3);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/validations/transaction-filters.spec.ts`
Expected: FAIL — cannot resolve `@/lib/validations/transaction-filters`.

- [ ] **Step 3: Implement**

Create `src/lib/validations/transaction-filters.ts`:

```ts
import { z } from "zod";

import { ISO_DATE_PATTERN, toIsoDate } from "@/lib/dates";
import {
  TRANSACTION_ID_MAX_LENGTH,
  TRANSACTION_TYPES,
  type TransactionType,
} from "@/lib/validations/transaction";

export const PAGE_SIZE = 50;

export const TRANSACTION_SHOW_VALUES = ["all", "single", "recurring", "installments"] as const;
export const TRANSACTION_SORT_VALUES = ["date", "amount", "category", "description"] as const;
export const SORT_DIRECTIONS = ["asc", "desc"] as const;

export type TransactionShow = (typeof TRANSACTION_SHOW_VALUES)[number];
export type TransactionSort = (typeof TRANSACTION_SORT_VALUES)[number];
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

export type TransactionFilters = {
  /** `YYYY-MM-DD`, inclusive. */
  from: string;
  /** `YYYY-MM-DD`, inclusive. */
  to: string;
  categoryId: string | null;
  cardId: string | null;
  type: TransactionType | null;
  show: TransactionShow;
  sort: TransactionSort;
  dir: SortDirection;
  page: number;
};

const idSchema = z.string().trim().min(1).max(TRANSACTION_ID_MAX_LENGTH);

/**
 * `new Date("2026-02-31T00:00:00.000Z")` does NOT return an Invalid Date —
 * V8 silently rolls the day over to March 2nd. (An out-of-range *month* like
 * `2026-13-01` does fail, which is what makes the trap easy to miss.) So a
 * NaN check cannot reject a nonexistent day; round-tripping through
 * `toIsoDate` and comparing to the input is what actually does.
 */
const dateSchema = z
  .string()
  .trim()
  .regex(ISO_DATE_PATTERN)
  .refine((value) => toIsoDate(new Date(`${value}T00:00:00.000Z`)) === value);

const pageSchema = z.coerce.number().int().min(1);

/** Next hands back an array when a param is repeated; the first value wins. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Parses one param, substituting `fallback` for anything invalid. This is the
 * whole policy of this module: `searchParams` is attacker-controlled input,
 * but a bad value in a URL someone was handed should render page 1, never an
 * error page.
 */
function parseOr<T>(schema: z.ZodType<T>, value: unknown, fallback: T): T {
  const result = schema.safeParse(value);
  return result.success ? result.data : fallback;
}

export function defaultPeriod(today: Date): { from: string; to: string } {
  return {
    from: toIsoDate(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))),
    to: toIsoDate(today),
  };
}

export function parseTransactionFilters(
  params: Record<string, string | string[] | undefined>,
  today: Date = new Date(),
): TransactionFilters {
  const fallbackPeriod = defaultPeriod(today);

  const from = parseOr(dateSchema, first(params.from), "");
  const to = parseOr(dateSchema, first(params.to), "");
  // Both or neither: half a window the user did not ask for is more
  // confusing than the default one.
  const period = from && to && from <= to ? { from, to } : fallbackPeriod;

  return {
    ...period,
    categoryId: parseOr(idSchema.nullable(), first(params.category), null),
    cardId: parseOr(idSchema.nullable(), first(params.card), null),
    type: parseOr(z.enum(TRANSACTION_TYPES).nullable(), first(params.type), null),
    show: parseOr(z.enum(TRANSACTION_SHOW_VALUES), first(params.show), "all"),
    sort: parseOr(z.enum(TRANSACTION_SORT_VALUES), first(params.sort), "date"),
    dir: parseOr(z.enum(SORT_DIRECTIONS), first(params.dir), "desc"),
    page: parseOr(pageSchema, first(params.page), 1),
  };
}

/**
 * Defaults are omitted rather than written out, so "Clear filters" lands on a
 * bare `/transactions` instead of a URL restating every default.
 */
export function buildTransactionSearchParams(
  filters: TransactionFilters,
  today: Date = new Date(),
): URLSearchParams {
  const defaults = defaultPeriod(today);
  const params = new URLSearchParams();

  if (filters.from !== defaults.from || filters.to !== defaults.to) {
    params.set("from", filters.from);
    params.set("to", filters.to);
  }
  if (filters.categoryId) params.set("category", filters.categoryId);
  if (filters.cardId) params.set("card", filters.cardId);
  if (filters.type) params.set("type", filters.type);
  if (filters.show !== "all") params.set("show", filters.show);
  if (filters.sort !== "date") params.set("sort", filters.sort);
  if (filters.dir !== "desc") params.set("dir", filters.dir);
  if (filters.page !== 1) params.set("page", String(filters.page));

  return params;
}

export function clampPage(page: number, total: number): number {
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return Math.min(Math.max(page, 1), lastPage);
}

/**
 * Powers the badge on the filter panel's trigger. Sort, direction, and page
 * are view state, not filters, and are deliberately excluded — a user who
 * sorted by amount has not filtered anything.
 */
export function countActiveFilters(
  filters: TransactionFilters,
  today: Date = new Date(),
): number {
  const defaults = defaultPeriod(today);
  const periodChanged = filters.from !== defaults.from || filters.to !== defaults.to;

  return [
    periodChanged,
    filters.categoryId !== null,
    filters.cardId !== null,
    filters.type !== null,
    filters.show !== "all",
  ].filter(Boolean).length;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/validations/transaction-filters.spec.ts`
Expected: PASS, 24 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations/transaction-filters.ts src/lib/validations/transaction-filters.spec.ts
git commit -m "feat(transactions): parse list filters from the url"
```

---

## Task 8: The union list query

**Files:**
- Create: `src/lib/transactions/list-query.ts`
- Test: `src/lib/transactions/list-query.spec.ts`

**Interfaces:**
- Consumes: `Prisma` from `@/generated/prisma/client`; `prisma` from `@/lib/prisma`; `addDaysUtc`, `toUtcMidnight` from `@/lib/dates`; `PAGE_SIZE`, `TransactionFilters`, `TransactionShow` from `@/lib/validations/transaction-filters`.
- Produces:
  - `type TransactionListRow = { kind: "single" | "installment" | "recurring"; id: string; planId: string | null; effectiveDate: string; startDate: string | null; description: string | null; type: TransactionType; amount: string; isPaid: boolean; categoryId: string; cardId: string | null; frequency: RecurringFrequency | null; seriesIndex: number | null; seriesTotal: number | null }`
  - `planId` is the parent plan's id on an installment row and `null` otherwise. Task 20 needs it to link an occurrence to its plan's edit page; a row's own `id` is the transaction's, which has no edit page of its own.
  - `type ListQueryArgs = { userId: string; filters: TransactionFilters; categorySortNames: Map<string, string> }`
  - `buildListQueries(args: ListQueryArgs): { rows: Prisma.Sql; total: Prisma.Sql }`
  - `fetchTransactionList(args: ListQueryArgs): Promise<{ rows: TransactionListRow[]; total: number }>`

Every value crossing out of this module is a **string** (`amount`, `effectiveDate`, `startDate`) or a plain number — no `Decimal` and no `Date`, so rows pass straight into a Client Component without a serialization step.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/transactions/list-query.spec.ts`:

```ts
import { describe, expect, it } from "vitest";

import { buildListQueries } from "@/lib/transactions/list-query";
import {
  parseTransactionFilters,
  type TransactionFilters,
} from "@/lib/validations/transaction-filters";

const TODAY = new Date("2026-08-16T12:00:00.000Z");

const filtersFrom = (params: Record<string, string> = {}): TransactionFilters =>
  parseTransactionFilters(params, TODAY);

const build = (params: Record<string, string> = {}, categorySortNames = new Map<string, string>()) =>
  buildListQueries({ userId: "user-1", filters: filtersFrom(params), categorySortNames });

describe("buildListQueries", () => {
  describe("arm selection", () => {
    it("includes all three arms by default", () => {
      const { rows } = build();
      expect(rows.text).toContain("'single' AS \"kind\"");
      expect(rows.text).toContain("'installment' AS \"kind\"");
      expect(rows.text).toContain("'recurring' AS \"kind\"");
    });

    it("includes only the one-off arm for show=single", () => {
      const { rows } = build({ show: "single" });
      expect(rows.text).toContain("'single' AS \"kind\"");
      expect(rows.text).not.toContain("'installment' AS \"kind\"");
      expect(rows.text).not.toContain("'recurring' AS \"kind\"");
    });

    it("includes only the installment arm for show=installments", () => {
      const { rows } = build({ show: "installments" });
      expect(rows.text).toContain("'installment' AS \"kind\"");
      expect(rows.text).not.toContain("'single' AS \"kind\"");
    });

    it("includes only the ongoing arm for show=recurring", () => {
      const { rows } = build({ show: "recurring" });
      expect(rows.text).toContain("'recurring' AS \"kind\"");
      expect(rows.text).not.toContain("'single' AS \"kind\"");
    });
  });

  describe("row visibility", () => {
    // The original requirement: a row generated by an ongoing recurrence is
    // never listed. It is represented by its definition instead.
    it("excludes generated rows from the one-off arm", () => {
      expect(build({ show: "single" }).rows.text).toContain(
        "t.recurring_transaction_id IS NULL",
      );
    });

    it("restricts the installment arm to fixed-count parents", () => {
      expect(build({ show: "installments" }).rows.text).toContain(
        "r.fixed_occurrences_count = true",
      );
    });

    it("restricts the ongoing arm to non-fixed definitions", () => {
      expect(build({ show: "recurring" }).rows.text).toContain(
        "r.fixed_occurrences_count = false",
      );
    });

    it("excludes soft-deleted rows from every arm", () => {
      const { rows } = build();
      expect(rows.text.match(/deactivated_at IS NULL/g)?.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe("series numbering", () => {
    // Numbered before the period filter and before the soft-delete filter, so
    // deleting occurrence 3 does not renumber 4-12, and a window starting
    // mid-series still reads 7/12.
    it("numbers occurrences in a CTE over every generated row", () => {
      const { rows } = build({ show: "installments" });
      expect(rows.text).toContain("PARTITION BY t.recurring_transaction_id");
      expect(rows.text.indexOf("WITH series")).toBeLessThan(rows.text.indexOf("UNION ALL") + 1);
    });
  });

  describe("ordering", () => {
    it("defaults to date descending", () => {
      expect(build().rows.text).toContain('entries."effectiveDate" DESC');
    });

    it("ends every ordering with the same total tie-break", () => {
      for (const sort of ["date", "amount", "category", "description"]) {
        expect(build({ sort }).rows.text).toContain(
          'entries."effectiveDate" DESC, entries."kind" ASC, entries."id" ASC',
        );
      }
    });

    it("sorts amounts numerically, not as text", () => {
      expect(build({ sort: "amount" }).rows.text).toContain('(entries."amount")::numeric');
    });

    it("puts empty descriptions last in both directions", () => {
      expect(build({ sort: "description", dir: "asc" }).rows.text).toContain("NULLS LAST");
      expect(build({ sort: "description", dir: "desc" }).rows.text).toContain("NULLS LAST");
    });

    it("honours the direction", () => {
      expect(build({ dir: "asc" }).rows.text).toContain('entries."effectiveDate" ASC');
    });
  });

  describe("category ordering", () => {
    // A preset category stores English in `name`; ordering on the column
    // would sort a pt-BR list by words the user never sees.
    it("joins the resolved names only when sorting by category", () => {
      const names = new Map([["cat-1", "Alimentação"]]);
      expect(build({ sort: "category" }, names).rows.text).toContain("AS cat(id, sort_name)");
      expect(build({ sort: "date" }, names).rows.text).not.toContain("AS cat(id, sort_name)");
    });

    it("passes each resolved name as a parameter, never inlined", () => {
      const names = new Map([["cat-1", "Alimentação"]]);
      expect(build({ sort: "category" }, names).rows.values).toContain("Alimentação");
      expect(build({ sort: "category" }, names).rows.text).not.toContain("Alimentação");
    });

    it("still orders when the user has no categories", () => {
      const { rows } = build({ sort: "category" }, new Map());
      expect(rows.text).toContain("ORDER BY");
    });
  });

  describe("filters", () => {
    it("scopes every query to the session user", () => {
      expect(build().rows.values).toContain("user-1");
    });

    it("adds no optional predicate when nothing is filtered", () => {
      const { rows } = build();
      expect(rows.text).not.toContain("category_id = ");
      expect(rows.text).not.toContain("card_id = ");
    });

    it("filters by category, card, and type when asked", () => {
      const { rows } = build({ category: "cat-1", card: "card-1", type: "INCOME" });
      expect(rows.values).toContain("cat-1");
      expect(rows.values).toContain("card-1");
      expect(rows.values).toContain("INCOME");
    });

    // `to` is inclusive for the user, so the exclusive bound is the next day.
    it("turns the inclusive end date into an exclusive next-day bound", () => {
      const { rows } = build({ from: "2026-03-01", to: "2026-03-31" });
      const dates = rows.values.filter((value): value is Date => value instanceof Date);
      expect(dates.map((date) => date.toISOString())).toContain("2026-03-01T00:00:00.000Z");
      expect(dates.map((date) => date.toISOString())).toContain("2026-04-01T00:00:00.000Z");
    });
  });

  describe("pagination", () => {
    it("offsets by page size", () => {
      expect(build({ page: "3" }).rows.values).toContain(100);
      expect(build({ page: "1" }).rows.values).toContain(0);
    });

    it("counts without ordering or limiting", () => {
      const { total } = build({ page: "3" });
      expect(total.text).toContain("COUNT(*)");
      expect(total.text).not.toContain("LIMIT");
      expect(total.text).not.toContain("ORDER BY");
    });

    it("counts the same rows the page query returns", () => {
      const { total } = build({ show: "single" });
      expect(total.text).toContain("t.recurring_transaction_id IS NULL");
      expect(total.text).not.toContain("'recurring' AS \"kind\"");
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/transactions/list-query.spec.ts`
Expected: FAIL — cannot resolve `@/lib/transactions/list-query`.

- [ ] **Step 3: Implement**

Create `src/lib/transactions/list-query.ts`:

```ts
import { Prisma } from "@/generated/prisma/client";

import { addDaysUtc, toUtcMidnight } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import type { RecurringFrequency } from "@/lib/transactions/occurrences";
import type { TransactionType } from "@/lib/validations/transaction";
import {
  PAGE_SIZE,
  type TransactionFilters,
  type TransactionShow,
} from "@/lib/validations/transaction-filters";

/**
 * One row of the list, whichever table it came from. Everything is a string
 * or a plain number: `amount` is cast to text in SQL rather than arriving as
 * a `Decimal`, and dates as `YYYY-MM-DD` rather than as `Date`, so a row can
 * be handed to a Client Component untouched.
 */
export type TransactionListRow = {
  kind: "single" | "installment" | "recurring";
  id: string;
  /**
   * The parent plan's id on an installment row, null otherwise. A generated
   * occurrence has no edit page of its own — its Edit action opens its plan —
   * so the row has to carry the id that page lives at.
   */
  planId: string | null;
  /** `YYYY-MM-DD`. For an ongoing recurrence, its latest occurrence in the window. */
  effectiveDate: string;
  /** `YYYY-MM-DD`; set for recurrence and installment rows, null for one-offs. */
  startDate: string | null;
  description: string | null;
  type: TransactionType;
  amount: string;
  isPaid: boolean;
  categoryId: string;
  cardId: string | null;
  frequency: RecurringFrequency | null;
  /** 1-based position in an installment series. */
  seriesIndex: number | null;
  seriesTotal: number | null;
};

export type ListQueryArgs = {
  userId: string;
  filters: TransactionFilters;
  /** Category id → resolved display name. Only consulted for `sort=category`. */
  categorySortNames: Map<string, string>;
};

type ArmName = TransactionListRow["kind"];

function armsFor(show: TransactionShow): ArmName[] {
  switch (show) {
    case "single":
      return ["single"];
    case "installments":
      return ["installment"];
    case "recurring":
      return ["recurring"];
    case "all":
      return ["single", "installment", "recurring"];
  }
}

/**
 * The optional predicates, written against whichever table's columns the arm
 * uses. `type` is compared as text so this does not depend on the Postgres
 * enum type's name.
 */
function optionalPredicates(
  filters: TransactionFilters,
  columns: { categoryId: Prisma.Sql; cardId: Prisma.Sql; type: Prisma.Sql },
): Prisma.Sql {
  const parts: Prisma.Sql[] = [];

  if (filters.categoryId) parts.push(Prisma.sql`AND ${columns.categoryId} = ${filters.categoryId}`);
  if (filters.cardId) parts.push(Prisma.sql`AND ${columns.cardId} = ${filters.cardId}`);
  if (filters.type) parts.push(Prisma.sql`AND ${columns.type}::text = ${filters.type}`);

  return parts.length > 0 ? Prisma.join(parts, " ") : Prisma.empty;
}

function singleArm(userId: string, filters: TransactionFilters, from: Date, toExclusive: Date) {
  return Prisma.sql`
    SELECT 'single' AS "kind",
           t.id AS "id",
           NULL::text AS "planId",
           to_char(t.date, 'YYYY-MM-DD') AS "effectiveDate",
           NULL::text AS "startDate",
           t.description AS "description",
           t.type::text AS "type",
           t.amount::text AS "amount",
           t.is_paid AS "isPaid",
           t.category_id AS "categoryId",
           t.card_id AS "cardId",
           NULL::text AS "frequency",
           NULL::int AS "seriesIndex",
           NULL::int AS "seriesTotal"
      FROM transactions t
     WHERE t.user_id = ${userId}
       AND t.deactivated_at IS NULL
       AND t.recurring_transaction_id IS NULL
       AND t.date >= ${from} AND t.date < ${toExclusive}
       ${optionalPredicates(filters, {
         categoryId: Prisma.raw("t.category_id"),
         cardId: Prisma.raw("t.card_id"),
         type: Prisma.raw("t.type"),
       })}`;
}

function installmentArm(userId: string, filters: TransactionFilters, from: Date, toExclusive: Date) {
  return Prisma.sql`
    SELECT 'installment' AS "kind",
           t.id AS "id",
           r.id AS "planId",
           to_char(t.date, 'YYYY-MM-DD') AS "effectiveDate",
           to_char(r.start_date, 'YYYY-MM-DD') AS "startDate",
           t.description AS "description",
           t.type::text AS "type",
           t.amount::text AS "amount",
           t.is_paid AS "isPaid",
           t.category_id AS "categoryId",
           t.card_id AS "cardId",
           r.frequency::text AS "frequency",
           s.index AS "seriesIndex",
           r.occurrences_count AS "seriesTotal"
      FROM transactions t
      JOIN recurring_transactions r ON r.id = t.recurring_transaction_id
      JOIN series s ON s.id = t.id
     WHERE t.user_id = ${userId}
       AND t.deactivated_at IS NULL
       AND r.fixed_occurrences_count = true
       AND r.deactivated_at IS NULL
       AND t.date >= ${from} AND t.date < ${toExclusive}
       ${optionalPredicates(filters, {
         categoryId: Prisma.raw("t.category_id"),
         cardId: Prisma.raw("t.card_id"),
         type: Prisma.raw("t.type"),
       })}`;
}

/**
 * An ongoing recurrence has no date of its own, so one is derived: the latest
 * occurrence at or before the window's end, falling back to `startDate` when
 * it has generated nothing. The LATERAL join computes it once and both the
 * projection and the period filter read it, rather than repeating the
 * subquery.
 */
function recurringArm(userId: string, filters: TransactionFilters, from: Date, toExclusive: Date) {
  return Prisma.sql`
    SELECT 'recurring' AS "kind",
           r.id AS "id",
           NULL::text AS "planId",
           to_char(effective.value, 'YYYY-MM-DD') AS "effectiveDate",
           to_char(r.start_date, 'YYYY-MM-DD') AS "startDate",
           r.description AS "description",
           r.type::text AS "type",
           r.amount::text AS "amount",
           false AS "isPaid",
           r.category_id AS "categoryId",
           r.card_id AS "cardId",
           r.frequency::text AS "frequency",
           NULL::int AS "seriesIndex",
           NULL::int AS "seriesTotal"
      FROM recurring_transactions r
      CROSS JOIN LATERAL (
        SELECT COALESCE(
                 (SELECT MAX(x.date) FROM transactions x
                   WHERE x.recurring_transaction_id = r.id
                     AND x.deactivated_at IS NULL
                     AND x.date < ${toExclusive}),
                 r.start_date
               ) AS value
      ) AS effective
     WHERE r.user_id = ${userId}
       AND r.deactivated_at IS NULL
       AND r.fixed_occurrences_count = false
       AND effective.value >= ${from} AND effective.value < ${toExclusive}
       ${optionalPredicates(filters, {
         categoryId: Prisma.raw("r.category_id"),
         cardId: Prisma.raw("r.card_id"),
         type: Prisma.raw("r.type"),
       })}`;
}

/**
 * Numbering runs over every generated row — before the period filter and
 * before the soft-delete filter — so an occurrence keeps the position it was
 * created with even after an earlier sibling is deleted or falls outside the
 * window.
 */
function seriesCte(userId: string) {
  return Prisma.sql`
    WITH series AS (
      SELECT t.id AS id,
             (ROW_NUMBER() OVER (
               PARTITION BY t.recurring_transaction_id ORDER BY t.date, t.id
             ))::int AS index
        FROM transactions t
       WHERE t.user_id = ${userId}
         AND t.recurring_transaction_id IS NOT NULL
    )`;
}

function unionOf(arms: Prisma.Sql[]) {
  return Prisma.join(arms, " UNION ALL ");
}

/**
 * Ordering always ends with the same tie-break chain. `ORDER BY date DESC`
 * alone is not a total order — transactions share dates constantly — and with
 * LIMIT/OFFSET a tied row can otherwise appear on two consecutive pages or on
 * neither.
 */
function orderByClause(filters: TransactionFilters) {
  const direction = filters.dir === "asc" ? Prisma.raw("ASC") : Prisma.raw("DESC");

  const primary =
    filters.sort === "amount"
      ? Prisma.sql`(entries."amount")::numeric ${direction}`
      : filters.sort === "description"
        ? Prisma.sql`entries."description" ${direction} NULLS LAST`
        : filters.sort === "category"
          ? Prisma.sql`cat.sort_name ${direction} NULLS LAST`
          : Prisma.sql`entries."effectiveDate" ${direction}`;

  return Prisma.sql`ORDER BY ${primary}, entries."effectiveDate" DESC, entries."kind" ASC, entries."id" ASC`;
}

/**
 * The resolved display names, joined in as a literal table so Postgres can
 * order on the text the user actually reads while pagination stays exact.
 * Affordable because categories are capped at 50 per user.
 */
function categoryJoinClause(filters: TransactionFilters, names: Map<string, string>) {
  if (filters.sort !== "category") return Prisma.empty;
  if (names.size === 0) {
    // No categories to join. A one-row table that matches nothing keeps
    // `cat.sort_name` a valid reference in ORDER BY.
    return Prisma.sql`LEFT JOIN (SELECT NULL::text AS id, NULL::text AS sort_name) AS cat ON false`;
  }

  const tuples = [...names].map(([id, name]) => Prisma.sql`(${id}::text, ${name}::text)`);

  return Prisma.sql`LEFT JOIN (VALUES ${Prisma.join(tuples, ", ")}) AS cat(id, sort_name) ON cat.id = entries."categoryId"`;
}

export function buildListQueries({ userId, filters, categorySortNames }: ListQueryArgs): {
  rows: Prisma.Sql;
  total: Prisma.Sql;
} {
  const from = toUtcMidnight(filters.from);
  // The user's end date is inclusive, so the SQL bound is the following day.
  const toExclusive = addDaysUtc(toUtcMidnight(filters.to), 1);

  const armBuilders: Record<ArmName, () => Prisma.Sql> = {
    single: () => singleArm(userId, filters, from, toExclusive),
    installment: () => installmentArm(userId, filters, from, toExclusive),
    recurring: () => recurringArm(userId, filters, from, toExclusive),
  };

  const arms = armsFor(filters.show).map((name) => armBuilders[name]());
  const cte = seriesCte(userId);
  const body = unionOf(arms);
  const offset = (filters.page - 1) * PAGE_SIZE;

  return {
    rows: Prisma.sql`${cte}
      SELECT entries.* FROM (${body}) AS entries
      ${categoryJoinClause(filters, categorySortNames)}
      ${orderByClause(filters)}
      LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    total: Prisma.sql`${cte}
      SELECT COUNT(*)::int AS "total" FROM (${body}) AS entries`,
  };
}

export async function fetchTransactionList(args: ListQueryArgs): Promise<{
  rows: TransactionListRow[];
  total: number;
}> {
  const { rows, total } = buildListQueries(args);

  const [rowResults, totalResults] = await Promise.all([
    prisma.$queryRaw<TransactionListRow[]>(rows),
    prisma.$queryRaw<{ total: number }[]>(total),
  ]);

  return { rows: rowResults, total: totalResults[0]?.total ?? 0 };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/transactions/list-query.spec.ts`
Expected: PASS, 22 tests.

- [ ] **Step 5: Prove the SQL is valid against a real database**

The unit tests check the SQL's *shape*; only Postgres can say it parses. Run each `show` variant once against the test database:

```bash
DATABASE_URL="$DATABASE_URL_TEST" npx tsx --eval "
import { buildListQueries } from './src/lib/transactions/list-query';
import { prisma } from './src/lib/prisma';
import { parseTransactionFilters } from './src/lib/validations/transaction-filters';
for (const show of ['all', 'single', 'recurring', 'installments']) {
  for (const sort of ['date', 'amount', 'category', 'description']) {
    const filters = parseTransactionFilters({ show, sort });
    const { rows, total } = buildListQueries({
      userId: 'nobody', filters, categorySortNames: new Map([['c1', 'Food']]),
    });
    await prisma.\$queryRaw(rows);
    await prisma.\$queryRaw(total);
  }
}
console.log('all 16 query variants parsed and executed');
await prisma.\$disconnect();
"
```

Expected: `all 16 query variants parsed and executed`. A syntax error, an ambiguous column, or a UNION type mismatch fails here — this is the only place before e2e that catches one.

- [ ] **Step 6: Commit**

```bash
git add src/lib/transactions/list-query.ts src/lib/transactions/list-query.spec.ts
git commit -m "feat(transactions): build the union list query"
```

---

## Task 9: Category and card option endpoints

**Files:**
- Create: `src/lib/options.ts`
- Create: `src/app/api/categories/options/route.ts`
- Create: `src/app/api/cards/options/route.ts`
- Test: `src/app/api/categories/options/route.spec.ts`

**Interfaces:**
- Consumes: `auth`, `prisma`, `resolveCategoryDisplay`, `routing`.
- Produces:
  - From `options.ts`: `OPTIONS_PAGE_SIZE = 10`, `MAX_OPTIONS_QUERY_LENGTH = 100`, `type ComboboxOption = { id: string; name: string }`, `type OptionsResponse = { items: ComboboxOption[]; hasMore: boolean }`, `parseOptionsParams(url: URL): { q: string; page: number; locale: Locale }`
  - `GET /api/categories/options?q=&page=&locale=` and `GET /api/cards/options?q=&page=&locale=`, both returning `OptionsResponse`, both `401` with an empty body when signed out.

- [ ] **Step 1: Read the Route Handler conventions**

Read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`. Note: a `route.ts` exports HTTP-method functions; do not export anything else from it (shared constants live in `src/lib/options.ts` for exactly this reason).

- [ ] **Step 2: Write the failing tests**

Create `src/app/api/categories/options/route.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { category: { findMany: vi.fn() } },
}));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn() }));

import { getTranslations } from "next-intl/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { GET } from "@/app/api/categories/options/route";

const SESSION = { user: { id: "user-1" }, session: {} };

/** Preset rows hold English in `name` and are translated for display. */
const category = (id: string, name: string, systemLocaleKey: string | null = null) => ({
  id,
  name,
  description: null,
  systemLocaleKey,
});

const call = (query: string) =>
  GET(new Request(`http://localhost:3000/api/categories/options${query}`));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);
  vi.mocked(getTranslations).mockResolvedValue(((key: string) => key) as never);
  vi.mocked(prisma.category.findMany).mockResolvedValue([] as never);
});

describe("GET /api/categories/options", () => {
  it("returns 401 and no rows when there is no session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never);

    const response = await call("");

    expect(response.status).toBe(401);
    expect(prisma.category.findMany).not.toHaveBeenCalled();
  });

  it("scopes the query to the session user's active categories", async () => {
    await call("");

    expect(prisma.category.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", deactivatedAt: null },
      select: { id: true, name: true, description: true, systemLocaleKey: true },
    });
  });

  it("returns at most one page and reports that more exist", async () => {
    vi.mocked(prisma.category.findMany).mockResolvedValue(
      Array.from({ length: 25 }, (_unused, index) =>
        category(`c${index}`, `Category ${String(index).padStart(2, "0")}`),
      ) as never,
    );

    const body = await (await call("")).json();

    expect(body.items).toHaveLength(10);
    expect(body.hasMore).toBe(true);
  });

  it("pages through the sorted list", async () => {
    vi.mocked(prisma.category.findMany).mockResolvedValue(
      Array.from({ length: 25 }, (_unused, index) =>
        category(`c${index}`, `Category ${String(index).padStart(2, "0")}`),
      ) as never,
    );

    const body = await (await call("?page=3")).json();

    expect(body.items).toHaveLength(5);
    expect(body.hasMore).toBe(false);
  });

  it("sorts by name ascending", async () => {
    vi.mocked(prisma.category.findMany).mockResolvedValue([
      category("c1", "Zebra"),
      category("c2", "Apple"),
    ] as never);

    const body = await (await call("")).json();

    expect(body.items.map((item: { name: string }) => item.name)).toEqual(["Apple", "Zebra"]);
  });

  it("filters case-insensitively on the name", async () => {
    vi.mocked(prisma.category.findMany).mockResolvedValue([
      category("c1", "Food"),
      category("c2", "Transport"),
    ] as never);

    const body = await (await call("?q=FOO")).json();

    expect(body.items).toEqual([{ id: "c1", name: "Food" }]);
  });

  // The reason this endpoint cannot search or sort in SQL: a preset row's
  // `name` column holds English text the user may never see.
  it("searches and sorts the resolved display name, not the stored column", async () => {
    vi.mocked(getTranslations).mockResolvedValue(((key: string) =>
      key === "food.name" ? "Alimentação" : key) as never);
    vi.mocked(prisma.category.findMany).mockResolvedValue([
      category("c1", "Food", "food"),
    ] as never);

    const body = await (await call("?q=aliment&locale=pt-BR")).json();

    expect(body.items).toEqual([{ id: "c1", name: "Alimentação" }]);
  });

  it("falls back to the default locale for an unsupported one", async () => {
    await call("?locale=fr-CA");

    expect(getTranslations).toHaveBeenCalledWith({
      locale: "en-US",
      namespace: "categories.presets",
    });
  });

  it("treats a malformed page as page 1 rather than erroring", async () => {
    vi.mocked(prisma.category.findMany).mockResolvedValue([category("c1", "Food")] as never);

    const response = await call("?page=-7");

    expect(response.status).toBe(200);
    expect((await response.json()).items).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/app/api/categories/options/route.spec.ts`
Expected: FAIL — cannot resolve the route module.

- [ ] **Step 4: Implement the shared parsing module**

Create `src/lib/options.ts`:

```ts
import { hasLocale, type Locale } from "next-intl";
import { z } from "zod";

import { routing } from "@/i18n/routing";

/** One dropdown page. Small on purpose: the list is scrolled, not scanned. */
export const OPTIONS_PAGE_SIZE = 10;
export const MAX_OPTIONS_QUERY_LENGTH = 100;

export type ComboboxOption = { id: string; name: string };
export type OptionsResponse = { items: ComboboxOption[]; hasMore: boolean };

const querySchema = z.string().trim().max(MAX_OPTIONS_QUERY_LENGTH);
const pageSchema = z.coerce.number().int().min(1);

/**
 * Same policy as the list page's `searchParams`: anything malformed falls
 * back to its default rather than producing a 400. These endpoints only ever
 * fail with 401.
 *
 * `locale` is a required part of the contract rather than something resolved
 * here — route handlers live outside the `[locale]` segment, so next-intl
 * cannot work one out. See `.claude/rules/i18n.md`.
 */
export function parseOptionsParams(url: URL): { q: string; page: number; locale: Locale } {
  const rawQuery = querySchema.safeParse(url.searchParams.get("q") ?? "");
  const rawPage = pageSchema.safeParse(url.searchParams.get("page") ?? "1");
  const rawLocale = url.searchParams.get("locale") ?? "";

  return {
    q: rawQuery.success ? rawQuery.data : "",
    page: rawPage.success ? rawPage.data : 1,
    locale: hasLocale(routing.locales, rawLocale) ? rawLocale : routing.defaultLocale,
  };
}

/** Slices one page out of an already-sorted list and reports whether more follow. */
export function pageOf(items: ComboboxOption[], page: number): OptionsResponse {
  const start = (page - 1) * OPTIONS_PAGE_SIZE;
  return {
    items: items.slice(start, start + OPTIONS_PAGE_SIZE),
    hasMore: items.length > start + OPTIONS_PAGE_SIZE,
  };
}
```

- [ ] **Step 5: Implement the categories endpoint**

Create `src/app/api/categories/options/route.ts`:

```ts
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";

import { auth } from "@/lib/auth";
import { resolveCategoryDisplay } from "@/lib/category-display";
import { pageOf, parseOptionsParams } from "@/lib/options";
import { prisma } from "@/lib/prisma";

/**
 * Searching and sorting happen in application code, not SQL: a preset
 * category stores English text in `name` and is translated at render time, so
 * the database would match and order on words the user never sees. Loading
 * every row first is affordable because categories are capped at 50 per user
 * — the same reason `/categories` sorts in application code.
 */
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response(null, { status: 401 });

  const { q, page, locale } = parseOptionsParams(new URL(request.url));

  const categories = await prisma.category.findMany({
    where: { userId: session.user.id, deactivatedAt: null },
    select: { id: true, name: true, description: true, systemLocaleKey: true },
  });

  const t = await getTranslations({ locale, namespace: "categories.presets" });
  const collator = new Intl.Collator(locale);
  const needle = q.toLocaleLowerCase(locale);

  const items = categories
    .map((category) => ({
      id: category.id,
      name: resolveCategoryDisplay(category, t).name,
    }))
    .filter((option) => option.name.toLocaleLowerCase(locale).includes(needle))
    .sort((a, b) => collator.compare(a.name, b.name));

  return Response.json(pageOf(items, page));
}
```

- [ ] **Step 6: Implement the cards endpoint**

Create `src/app/api/cards/options/route.ts`:

```ts
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { OPTIONS_PAGE_SIZE, parseOptionsParams } from "@/lib/options";
import { prisma } from "@/lib/prisma";

/**
 * Unlike categories, a card's `name` is always literal text, so searching and
 * ordering happen in SQL — matching how `/cards` already orders. One extra
 * row is fetched to tell whether another page exists without a second count.
 */
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response(null, { status: 401 });

  const { q, page } = parseOptionsParams(new URL(request.url));

  const cards = await prisma.card.findMany({
    where: {
      userId: session.user.id,
      deactivatedAt: null,
      ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    skip: (page - 1) * OPTIONS_PAGE_SIZE,
    take: OPTIONS_PAGE_SIZE + 1,
  });

  return Response.json({
    items: cards.slice(0, OPTIONS_PAGE_SIZE),
    hasMore: cards.length > OPTIONS_PAGE_SIZE,
  });
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/app/api/categories/options/route.spec.ts`
Expected: PASS, 9 tests.

- [ ] **Step 8: Confirm the endpoints are reachable and guarded**

Start the dev server (`npm run dev`) and check that the middleware does not intercept them — `src/proxy.ts`'s matcher excludes `api`:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/cards/options"
```

Expected: `401` (not a redirect to `/en-US/login`, and not a 404).

- [ ] **Step 9: Commit**

```bash
git add src/lib/options.ts "src/app/api/categories/options/route.ts" "src/app/api/cards/options/route.ts" "src/app/api/categories/options/route.spec.ts"
git commit -m "feat(transactions): add category and card option endpoints"
```

---

## Task 10: shadcn primitives and the income colour token

**Files:**
- Create (generated): `src/components/ui/{select,popover,calendar,collapsible,checkbox,badge,pagination,combobox}.tsx`
- Modify: `src/app/globals.css`
- Modify: `package.json` (the calendar's `react-day-picker` dependency)

**Interfaces:**
- Produces: the shadcn primitives every later UI task imports, and a `--success` / `--success-foreground` token pair exposed to Tailwind as `text-success` / `bg-success`.

- [ ] **Step 1: Add the primitives**

Use the `shadcn` skill; the project is on the `base-vega` style (`components.json`). It installs into `src/components/ui/` via the `@/components/ui` alias.

```bash
npx shadcn@latest add select popover calendar collapsible checkbox badge pagination combobox
```

Base UI (already a dependency) provides `select`, `popover`, `collapsible`, `checkbox`, and `combobox`; `calendar` is the one that pulls a new package (`react-day-picker`). Accept it — a hand-rolled date grid is not a trade worth making.

- [ ] **Step 2: Verify what actually landed**

```bash
ls src/components/ui
grep -n "export" src/components/ui/combobox.tsx | head -20
grep -n "react-day-picker" package.json
```

Record the exported names from `combobox.tsx` — Task 12 composes them, and the registry's naming (`Combobox`, `ComboboxInput`, `ComboboxList`, …) is what the code there must match. If the registry's combobox differs from what Task 12 assumes, adapt Task 12's imports, not its behaviour.

- [ ] **Step 3: Add the income colour token**

In `src/app/globals.css`, beside the existing `--destructive` declarations, add to **both** the light `:root` block and the dark block:

```css
/* Income amounts. `--destructive` would read an ordinary expense as an
   error, and the palette had no green before this. */
--success: oklch(0.55 0.13 150);
--success-foreground: oklch(0.98 0 0);
```

Dark theme values:

```css
--success: oklch(0.72 0.15 150);
--success-foreground: oklch(0.18 0 0);
```

Then expose them in the `@theme inline` block alongside the other colour mappings:

```css
--color-success: var(--success);
--color-success-foreground: var(--success-foreground);
```

- [ ] **Step 4: Verify the token resolves in both themes**

Run `npm run dev`, open any page, and in the browser console:

```js
getComputedStyle(document.documentElement).getPropertyValue("--success")
```

Expected: a non-empty `oklch(...)` value. Toggle the theme and confirm it changes.

- [ ] **Step 5: Typecheck and lint the generated files**

Run: `npx tsc --noEmit && npm run lint`
Expected: pass. Generated components sometimes need an `aria-hidden` or import tidy to satisfy this project's eslint config — fix those, do not disable rules.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui src/app/globals.css package.json package-lock.json
git commit -m "chore(ui): add select, calendar, combobox primitives and the success token"
```

---

## Task 11: Message catalogues

**Files:**
- Modify: `messages/en-US.json`, `messages/pt-BR.json`, `messages/de-DE.json`
- Test: `src/i18n/messages.spec.ts` (existing — it enforces the parity this task must satisfy)

**Interfaces:**
- Produces: the `transactions.*`, `validation.transactions.*`, `ui.asyncCombobox.*`, `ui.pagination.*`, `ui.datePicker.*`, and `dashboard.transactionsNavLabel` keys every UI task reads. `messages/en-US.json` is the one TypeScript checks `t("…")` against.

- [ ] **Step 1: Read the i18n rules**

Read `.claude/rules/i18n.md`. Note: all three catalogues change in the same commit; numbers are interpolated as `{placeholders}`, never written into the copy; `src/i18n/messages.spec.ts` asserts identical key sets, identical placeholders, and no empty strings.

- [ ] **Step 2: Add the English keys**

In `messages/en-US.json`, add `transactionsNavLabel` to the existing `dashboard` object:

```json
"transactionsNavLabel": "Transactions"
```

Add to the existing `ui` object:

```json
"asyncCombobox": {
  "search": "Search",
  "loading": "Loading…",
  "loadingMore": "Loading more…",
  "empty": "No results.",
  "error": "Couldn't load options. Try again.",
  "clear": "Clear selection"
},
"pagination": {
  "label": "Pagination",
  "previous": "Previous",
  "next": "Next",
  "page": "Page {page}",
  "status": "Page {page} of {total}"
},
"datePicker": {
  "open": "Choose a date",
  "placeholder": "Pick a date"
}
```

Add to the existing `validation` object:

```json
"transactions": {
  "amount": {
    "invalid": "Enter an amount using digits, with at most two decimal places.",
    "tooSmall": "Amount must be greater than zero.",
    "tooLarge": "Amount must be at most {max}."
  },
  "category": { "required": "Choose a category." },
  "card": {
    "notForIncome": "Income can't be assigned to a card.",
    "invalid": "Choose a card from your list."
  },
  "description": { "tooLong": "Description must be at most {max} characters." },
  "type": { "invalid": "Choose income or expense." },
  "date": {
    "invalid": "Enter a valid date.",
    "outOfRange": "Date must be between {min} and {max}."
  },
  "frequency": { "invalid": "Choose how often this repeats." },
  "occurrences": {
    "invalid": "Enter a whole number of payments, starting at one.",
    "tooMany": "You can create at most {max} payments at once."
  }
}
```

Add a new top-level `transactions` object:

```json
"transactions": {
  "title": "Transactions",
  "description": "Everything you've earned and spent.",
  "notFound": "This transaction doesn't exist or you don't have access to it.",
  "invalidInput": "There was a problem with the information you submitted. Please check the fields and try again.",
  "actions": {
    "new": "New transaction",
    "newSingle": "One-off transaction",
    "newSingleHint": "A single payment or deposit.",
    "newRecurring": "Recurring transaction",
    "newRecurringHint": "Repeats indefinitely until you delete it.",
    "newInstallments": "Installments",
    "newInstallmentsHint": "A fixed number of payments, created up front.",
    "edit": "Edit",
    "delete": "Delete"
  },
  "table": {
    "date": "Date",
    "description": "Description",
    "category": "Category",
    "card": "Card",
    "type": "Type",
    "paid": "Paid",
    "amount": "Amount",
    "actions": "Actions",
    "none": "—",
    "paidYes": "Yes",
    "paidNo": "No",
    "typeIncome": "Income",
    "typeExpense": "Expense",
    "started": "Started {date}",
    "series": "{index} of {total}",
    "sortBy": "Sort by {column}",
    "empty": "You don't have any transactions yet.",
    "emptyCta": "New transaction",
    "emptyFiltered": "No transactions match these filters.",
    "emptyFilteredCta": "Clear filters"
  },
  "filters": {
    "title": "Filters",
    "active": "{count} active",
    "category": "Category",
    "card": "Card",
    "type": "Type",
    "show": "Show",
    "from": "From",
    "to": "To",
    "any": "All",
    "showAll": "All",
    "showSingle": "One-off only",
    "showRecurring": "Recurring only",
    "showInstallments": "Installments only",
    "apply": "Apply",
    "clear": "Clear"
  },
  "frequency": {
    "DAILY": "Daily",
    "WEEKLY": "Weekly",
    "BIWEEKLY": "Every two weeks",
    "MONTHLY": "Monthly",
    "QUARTERLY": "Quarterly",
    "SEMIANNUAL": "Twice a year",
    "YEARLY": "Yearly"
  },
  "form": {
    "typeLabel": "Type",
    "typeIncome": "Income",
    "typeExpense": "Expense",
    "amountLabel": "Amount",
    "amountPlaceholder": "0.00",
    "categoryLabel": "Category",
    "categoryPlaceholder": "Search categories",
    "cardLabel": "Card",
    "cardPlaceholder": "Search cards",
    "dateLabel": "Date",
    "startDateLabel": "Start date",
    "descriptionLabel": "Description",
    "descriptionPlaceholder": "e.g. Weekly groceries",
    "paidLabel": "Already paid",
    "frequencyLabel": "Repeats",
    "occurrencesLabel": "Number of payments",
    "submitCreate": "Create transaction",
    "submitCreating": "Creating…",
    "submitEdit": "Save changes",
    "submitSaving": "Saving…"
  },
  "single": {
    "newTitle": "New transaction",
    "editTitle": "Edit transaction",
    "back": "Back to transactions"
  },
  "recurring": {
    "newTitle": "New recurring transaction",
    "editTitle": "Edit recurring transaction",
    "note": "This defines the recurrence. Its transactions aren't created yet — that arrives with automatic generation."
  },
  "installments": {
    "newTitle": "New installments",
    "editTitle": "Edit installments",
    "preview": "{count} transactions, {first} to {last}",
    "seriesTitle": "All payments",
    "seriesNote": "Changing the category, card, or type updates every payment below.",
    "frozenNote": "How often it repeats, when it starts, and how many payments there are can't be changed. Create a new plan instead.",
    "occurrencesTitle": "Payments",
    "occurrenceSave": "Save",
    "occurrenceSaving": "Saving…",
    "occurrenceSaved": "Saved",
    "occurrenceDelete": "Delete payment"
  },
  "deleteDialog": {
    "title": "Delete this transaction?",
    "description": "This will remove the transaction from your list. This can't be undone.",
    "recurringTitle": "Delete this recurring transaction?",
    "recurringDescription": "This will stop the recurrence. This can't be undone.",
    "installmentsTitle": "Delete these installments?",
    "installmentsDescription": "This will remove the plan and all {count} of its payments. This can't be undone.",
    "confirm": "Delete",
    "confirming": "Deleting…",
    "cancel": "Cancel"
  }
}
```

- [ ] **Step 3: Add the Portuguese keys**

`messages/pt-BR.json` — same structure, same placeholders. `dashboard.transactionsNavLabel`: `"Transações"`.

```json
"asyncCombobox": {
  "search": "Buscar",
  "loading": "Carregando…",
  "loadingMore": "Carregando mais…",
  "empty": "Nenhum resultado.",
  "error": "Não foi possível carregar as opções. Tente novamente.",
  "clear": "Limpar seleção"
},
"pagination": {
  "label": "Paginação",
  "previous": "Anterior",
  "next": "Próxima",
  "page": "Página {page}",
  "status": "Página {page} de {total}"
},
"datePicker": { "open": "Escolher uma data", "placeholder": "Selecione uma data" }
```

```json
"transactions": {
  "amount": {
    "invalid": "Digite um valor com algarismos e no máximo duas casas decimais.",
    "tooSmall": "O valor deve ser maior que zero.",
    "tooLarge": "O valor deve ser no máximo {max}."
  },
  "category": { "required": "Escolha uma categoria." },
  "card": {
    "notForIncome": "Receitas não podem ser atribuídas a um cartão.",
    "invalid": "Escolha um cartão da sua lista."
  },
  "description": { "tooLong": "A descrição deve ter no máximo {max} caracteres." },
  "type": { "invalid": "Escolha receita ou despesa." },
  "date": {
    "invalid": "Digite uma data válida.",
    "outOfRange": "A data deve estar entre {min} e {max}."
  },
  "frequency": { "invalid": "Escolha com que frequência isso se repete." },
  "occurrences": {
    "invalid": "Digite um número inteiro de parcelas, a partir de um.",
    "tooMany": "Você pode criar no máximo {max} parcelas de uma vez."
  }
}
```

```json
"transactions": {
  "title": "Transações",
  "description": "Tudo o que você recebeu e gastou.",
  "notFound": "Esta transação não existe ou você não tem acesso a ela.",
  "invalidInput": "Houve um problema com as informações enviadas. Verifique os campos e tente novamente.",
  "actions": {
    "new": "Nova transação",
    "newSingle": "Transação única",
    "newSingleHint": "Um único pagamento ou recebimento.",
    "newRecurring": "Transação recorrente",
    "newRecurringHint": "Repete indefinidamente até você excluir.",
    "newInstallments": "Parcelamento",
    "newInstallmentsHint": "Um número fixo de parcelas, criadas de uma vez.",
    "edit": "Editar",
    "delete": "Excluir"
  },
  "table": {
    "date": "Data",
    "description": "Descrição",
    "category": "Categoria",
    "card": "Cartão",
    "type": "Tipo",
    "paid": "Pago",
    "amount": "Valor",
    "actions": "Ações",
    "none": "—",
    "paidYes": "Sim",
    "paidNo": "Não",
    "typeIncome": "Receita",
    "typeExpense": "Despesa",
    "started": "Início em {date}",
    "series": "{index} de {total}",
    "sortBy": "Ordenar por {column}",
    "empty": "Você ainda não tem transações.",
    "emptyCta": "Nova transação",
    "emptyFiltered": "Nenhuma transação corresponde a estes filtros.",
    "emptyFilteredCta": "Limpar filtros"
  },
  "filters": {
    "title": "Filtros",
    "active": "{count} ativos",
    "category": "Categoria",
    "card": "Cartão",
    "type": "Tipo",
    "show": "Exibir",
    "from": "De",
    "to": "Até",
    "any": "Todos",
    "showAll": "Todas",
    "showSingle": "Somente únicas",
    "showRecurring": "Somente recorrentes",
    "showInstallments": "Somente parcelamentos",
    "apply": "Aplicar",
    "clear": "Limpar"
  },
  "frequency": {
    "DAILY": "Diária",
    "WEEKLY": "Semanal",
    "BIWEEKLY": "Quinzenal",
    "MONTHLY": "Mensal",
    "QUARTERLY": "Trimestral",
    "SEMIANNUAL": "Semestral",
    "YEARLY": "Anual"
  },
  "form": {
    "typeLabel": "Tipo",
    "typeIncome": "Receita",
    "typeExpense": "Despesa",
    "amountLabel": "Valor",
    "amountPlaceholder": "0,00",
    "categoryLabel": "Categoria",
    "categoryPlaceholder": "Buscar categorias",
    "cardLabel": "Cartão",
    "cardPlaceholder": "Buscar cartões",
    "dateLabel": "Data",
    "startDateLabel": "Data de início",
    "descriptionLabel": "Descrição",
    "descriptionPlaceholder": "ex.: Compras da semana",
    "paidLabel": "Já pago",
    "frequencyLabel": "Repete",
    "occurrencesLabel": "Número de parcelas",
    "submitCreate": "Criar transação",
    "submitCreating": "Criando…",
    "submitEdit": "Salvar alterações",
    "submitSaving": "Salvando…"
  },
  "single": {
    "newTitle": "Nova transação",
    "editTitle": "Editar transação",
    "back": "Voltar para transações"
  },
  "recurring": {
    "newTitle": "Nova transação recorrente",
    "editTitle": "Editar transação recorrente",
    "note": "Isto define a recorrência. As transações dela ainda não são criadas — isso chega com a geração automática."
  },
  "installments": {
    "newTitle": "Novo parcelamento",
    "editTitle": "Editar parcelamento",
    "preview": "{count} transações, de {first} até {last}",
    "seriesTitle": "Todas as parcelas",
    "seriesNote": "Alterar a categoria, o cartão ou o tipo atualiza todas as parcelas abaixo.",
    "frozenNote": "A frequência, a data de início e o número de parcelas não podem ser alterados. Crie um novo parcelamento.",
    "occurrencesTitle": "Parcelas",
    "occurrenceSave": "Salvar",
    "occurrenceSaving": "Salvando…",
    "occurrenceSaved": "Salvo",
    "occurrenceDelete": "Excluir parcela"
  },
  "deleteDialog": {
    "title": "Excluir esta transação?",
    "description": "Isto removerá a transação da sua lista. Não é possível desfazer.",
    "recurringTitle": "Excluir esta transação recorrente?",
    "recurringDescription": "Isto encerrará a recorrência. Não é possível desfazer.",
    "installmentsTitle": "Excluir este parcelamento?",
    "installmentsDescription": "Isto removerá o parcelamento e todas as suas {count} parcelas. Não é possível desfazer.",
    "confirm": "Excluir",
    "confirming": "Excluindo…",
    "cancel": "Cancelar"
  }
}
```

- [ ] **Step 4: Add the German keys**

`messages/de-DE.json` — `dashboard.transactionsNavLabel`: `"Transaktionen"`.

```json
"asyncCombobox": {
  "search": "Suchen",
  "loading": "Wird geladen…",
  "loadingMore": "Mehr wird geladen…",
  "empty": "Keine Ergebnisse.",
  "error": "Optionen konnten nicht geladen werden. Bitte erneut versuchen.",
  "clear": "Auswahl löschen"
},
"pagination": {
  "label": "Seitennummerierung",
  "previous": "Zurück",
  "next": "Weiter",
  "page": "Seite {page}",
  "status": "Seite {page} von {total}"
},
"datePicker": { "open": "Datum auswählen", "placeholder": "Datum wählen" }
```

```json
"transactions": {
  "amount": {
    "invalid": "Bitte einen Betrag mit Ziffern und höchstens zwei Nachkommastellen eingeben.",
    "tooSmall": "Der Betrag muss größer als null sein.",
    "tooLarge": "Der Betrag darf höchstens {max} sein."
  },
  "category": { "required": "Bitte eine Kategorie wählen." },
  "card": {
    "notForIncome": "Einnahmen können keiner Karte zugeordnet werden.",
    "invalid": "Bitte eine Karte aus deiner Liste wählen."
  },
  "description": { "tooLong": "Die Beschreibung darf höchstens {max} Zeichen lang sein." },
  "type": { "invalid": "Bitte Einnahme oder Ausgabe wählen." },
  "date": {
    "invalid": "Bitte ein gültiges Datum eingeben.",
    "outOfRange": "Das Datum muss zwischen {min} und {max} liegen."
  },
  "frequency": { "invalid": "Bitte wählen, wie oft sich das wiederholt." },
  "occurrences": {
    "invalid": "Bitte eine ganze Anzahl von Raten ab eins eingeben.",
    "tooMany": "Es können höchstens {max} Raten auf einmal erstellt werden."
  }
}
```

```json
"transactions": {
  "title": "Transaktionen",
  "description": "Alles, was du eingenommen und ausgegeben hast.",
  "notFound": "Diese Transaktion existiert nicht oder du hast keinen Zugriff darauf.",
  "invalidInput": "Mit den übermittelten Angaben stimmt etwas nicht. Bitte die Felder prüfen und erneut versuchen.",
  "actions": {
    "new": "Neue Transaktion",
    "newSingle": "Einmalige Transaktion",
    "newSingleHint": "Eine einzelne Zahlung oder Einnahme.",
    "newRecurring": "Wiederkehrende Transaktion",
    "newRecurringHint": "Wiederholt sich unbegrenzt, bis du sie löschst.",
    "newInstallments": "Ratenzahlung",
    "newInstallmentsHint": "Eine feste Anzahl von Raten, im Voraus angelegt.",
    "edit": "Bearbeiten",
    "delete": "Löschen"
  },
  "table": {
    "date": "Datum",
    "description": "Beschreibung",
    "category": "Kategorie",
    "card": "Karte",
    "type": "Art",
    "paid": "Bezahlt",
    "amount": "Betrag",
    "actions": "Aktionen",
    "none": "—",
    "paidYes": "Ja",
    "paidNo": "Nein",
    "typeIncome": "Einnahme",
    "typeExpense": "Ausgabe",
    "started": "Beginn am {date}",
    "series": "{index} von {total}",
    "sortBy": "Nach {column} sortieren",
    "empty": "Du hast noch keine Transaktionen.",
    "emptyCta": "Neue Transaktion",
    "emptyFiltered": "Keine Transaktionen entsprechen diesen Filtern.",
    "emptyFilteredCta": "Filter zurücksetzen"
  },
  "filters": {
    "title": "Filter",
    "active": "{count} aktiv",
    "category": "Kategorie",
    "card": "Karte",
    "type": "Art",
    "show": "Anzeigen",
    "from": "Von",
    "to": "Bis",
    "any": "Alle",
    "showAll": "Alle",
    "showSingle": "Nur einmalige",
    "showRecurring": "Nur wiederkehrende",
    "showInstallments": "Nur Ratenzahlungen",
    "apply": "Anwenden",
    "clear": "Zurücksetzen"
  },
  "frequency": {
    "DAILY": "Täglich",
    "WEEKLY": "Wöchentlich",
    "BIWEEKLY": "Alle zwei Wochen",
    "MONTHLY": "Monatlich",
    "QUARTERLY": "Vierteljährlich",
    "SEMIANNUAL": "Halbjährlich",
    "YEARLY": "Jährlich"
  },
  "form": {
    "typeLabel": "Art",
    "typeIncome": "Einnahme",
    "typeExpense": "Ausgabe",
    "amountLabel": "Betrag",
    "amountPlaceholder": "0,00",
    "categoryLabel": "Kategorie",
    "categoryPlaceholder": "Kategorien suchen",
    "cardLabel": "Karte",
    "cardPlaceholder": "Karten suchen",
    "dateLabel": "Datum",
    "startDateLabel": "Startdatum",
    "descriptionLabel": "Beschreibung",
    "descriptionPlaceholder": "z. B. Wocheneinkauf",
    "paidLabel": "Bereits bezahlt",
    "frequencyLabel": "Wiederholt sich",
    "occurrencesLabel": "Anzahl der Raten",
    "submitCreate": "Transaktion anlegen",
    "submitCreating": "Wird angelegt…",
    "submitEdit": "Änderungen speichern",
    "submitSaving": "Wird gespeichert…"
  },
  "single": {
    "newTitle": "Neue Transaktion",
    "editTitle": "Transaktion bearbeiten",
    "back": "Zurück zu den Transaktionen"
  },
  "recurring": {
    "newTitle": "Neue wiederkehrende Transaktion",
    "editTitle": "Wiederkehrende Transaktion bearbeiten",
    "note": "Dies legt nur die Wiederholung fest. Ihre Transaktionen werden noch nicht erzeugt — das kommt mit der automatischen Erzeugung."
  },
  "installments": {
    "newTitle": "Neue Ratenzahlung",
    "editTitle": "Ratenzahlung bearbeiten",
    "preview": "{count} Transaktionen, {first} bis {last}",
    "seriesTitle": "Alle Raten",
    "seriesNote": "Kategorie, Karte oder Art zu ändern aktualisiert alle Raten unten.",
    "frozenNote": "Wiederholung, Startdatum und Anzahl der Raten lassen sich nicht ändern. Bitte eine neue Ratenzahlung anlegen.",
    "occurrencesTitle": "Raten",
    "occurrenceSave": "Speichern",
    "occurrenceSaving": "Wird gespeichert…",
    "occurrenceSaved": "Gespeichert",
    "occurrenceDelete": "Rate löschen"
  },
  "deleteDialog": {
    "title": "Diese Transaktion löschen?",
    "description": "Die Transaktion wird aus deiner Liste entfernt. Das lässt sich nicht rückgängig machen.",
    "recurringTitle": "Diese wiederkehrende Transaktion löschen?",
    "recurringDescription": "Die Wiederholung wird beendet. Das lässt sich nicht rückgängig machen.",
    "installmentsTitle": "Diese Ratenzahlung löschen?",
    "installmentsDescription": "Der Plan und alle {count} Raten werden entfernt. Das lässt sich nicht rückgängig machen.",
    "confirm": "Löschen",
    "confirming": "Wird gelöscht…",
    "cancel": "Abbrechen"
  }
}
```

- [ ] **Step 5: Run the parity test**

Run: `npx vitest run src/i18n/messages.spec.ts`
Expected: PASS — identical key sets across all three files, identical `{placeholders}`, no empty strings. A failure here names the exact missing or mismatched key.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: pass. `global.d.ts` types `t()` keys against `en-US`, so a typo in the English file surfaces here rather than at runtime.

- [ ] **Step 7: Commit**

```bash
git add messages
git commit -m "feat(transactions): add transaction copy to all locales"
```

---

## Task 12: The async combobox

**Files:**
- Create: `src/components/ui/async-combobox.tsx`
- Test: `src/components/ui/async-combobox.spec.tsx`

**Interfaces:**
- Consumes: `ComboboxOption`, `OptionsResponse` from `@/lib/options`; `ui.asyncCombobox.*` copy.
- Produces:
  ```ts
  type AsyncComboboxProps = {
    endpoint: "/api/categories/options" | "/api/cards/options";
    value: string | null;
    onValueChange: (value: string | null) => void;
    /** The already-known label for `value`, so an edit page paints it without a fetch. */
    selectedOption?: ComboboxOption | null;
    placeholder: string;
    /** When set, the list gains a leading entry mapping to `null` — the filter row's "All". */
    allOptionLabel?: string;
    id?: string;
    invalid?: boolean;
    disabled?: boolean;
  };
  export function AsyncCombobox(props: AsyncComboboxProps): React.JSX.Element;
  ```

This component wraps Base UI's `Combobox` directly, the way `dropdown-menu.tsx` and `sidebar.tsx` already wrap Base UI's `Menu` and friends. Copy the class names from the `combobox.tsx` the registry generated in Task 10 so it matches the rest of the app; the behaviour below is what this file adds.

- [ ] **Step 1: Write the failing tests**

Create `src/components/ui/async-combobox.spec.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithIntl } from "@/test-utils/intl";
import { AsyncCombobox } from "@/components/ui/async-combobox";

const options = (count: number, prefix = "Item") =>
  Array.from({ length: count }, (_unused, index) => ({
    id: `id-${index}`,
    name: `${prefix} ${index}`,
  }));

const respondWith = (items: { id: string; name: string }[], hasMore = false) =>
  Promise.resolve(new Response(JSON.stringify({ items, hasMore }), { status: 200 }));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(() => respondWith(options(3)));
  vi.stubGlobal("fetch", fetchMock);
  // The real one needs layout, which jsdom has none of.
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const render = (props: Partial<Parameters<typeof AsyncCombobox>[0]> = {}) =>
  renderWithIntl(
    <AsyncCombobox
      endpoint="/api/cards/options"
      value={null}
      onValueChange={() => {}}
      placeholder="Search cards"
      {...props}
    />,
  );

describe("AsyncCombobox", () => {
  it("fetches the first page when opened", async () => {
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole("combobox"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toContain("/api/cards/options");
    expect(fetchMock.mock.calls[0][0]).toContain("page=1");
  });

  it("sends the active locale, which a route handler cannot resolve itself", async () => {
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole("combobox"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toContain("locale=en-US");
  });

  it("debounces typing into a single request", async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render();

    await user.click(screen.getByRole("combobox"));
    await vi.advanceTimersByTimeAsync(400);
    fetchMock.mockClear();

    await user.type(screen.getByRole("combobox"), "abc");
    // Two keystrokes' worth of waiting is not enough to fire anything.
    await vi.advanceTimersByTimeAsync(299);
    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toContain("q=abc");
  });

  it("resets to page 1 when the search changes", async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render();

    await user.click(screen.getByRole("combobox"));
    await vi.advanceTimersByTimeAsync(400);

    await user.type(screen.getByRole("combobox"), "z");
    await vi.advanceTimersByTimeAsync(300);

    await waitFor(() => {
      const lastCall = fetchMock.mock.calls.at(-1)?.[0] as string;
      expect(lastCall).toContain("page=1");
    });
  });

  it("renders the fetched options", async () => {
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole("combobox"));

    expect(await screen.findByText("Item 0")).toBeInTheDocument();
    expect(await screen.findByText("Item 2")).toBeInTheDocument();
  });

  it("reports the chosen option's id to the caller", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render({ onValueChange });

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByText("Item 1"));

    expect(onValueChange).toHaveBeenCalledWith("id-1");
  });

  it("shows the empty state when nothing matches", async () => {
    fetchMock.mockImplementation(() => respondWith([]));
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole("combobox"));

    expect(await screen.findByText("No results.")).toBeInTheDocument();
  });

  it("shows an error state when the request fails, and does not throw", async () => {
    fetchMock.mockImplementation(() => Promise.reject(new Error("offline")));
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole("combobox"));

    expect(await screen.findByText("Couldn't load options. Try again.")).toBeInTheDocument();
  });

  // The edit-page case: the label must be on screen from the first paint,
  // before any request resolves.
  it("displays a preselected option without fetching", () => {
    render({ value: "id-7", selectedOption: { id: "id-7", name: "Personal Visa" } });

    expect(screen.getByRole("combobox")).toHaveValue("Personal Visa");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("offers an All entry that clears the value when asked", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render({ allOptionLabel: "All", onValueChange });

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByText("All"));

    expect(onValueChange).toHaveBeenCalledWith(null);
  });

  it("marks itself invalid for the form to describe", () => {
    render({ invalid: true });

    expect(screen.getByRole("combobox")).toHaveAttribute("aria-invalid", "true");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/ui/async-combobox.spec.tsx`
Expected: FAIL — cannot resolve `@/components/ui/async-combobox`.

- [ ] **Step 3: Implement**

Create `src/components/ui/async-combobox.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { useLocale, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import type { ComboboxOption, OptionsResponse } from "@/lib/options";

const SEARCH_DEBOUNCE_MS = 300;

/** The "All" entry in the filter row. A sentinel id, never a real one. */
const ALL_OPTION_ID = "";

export type AsyncComboboxProps = {
  endpoint: "/api/categories/options" | "/api/cards/options";
  value: string | null;
  onValueChange: (value: string | null) => void;
  /**
   * The label already known for `value`. An edit page passes it so the field
   * shows its current value in the first paint rather than after a round
   * trip — the same first-paint concern `.claude/rules/ui.md` documents for
   * `register()`-ed inputs.
   */
  selectedOption?: ComboboxOption | null;
  placeholder: string;
  /** When set, a leading entry mapping to `null` is offered. */
  allOptionLabel?: string;
  id?: string;
  invalid?: boolean;
  disabled?: boolean;
};

export function AsyncCombobox({
  endpoint,
  value,
  onValueChange,
  selectedOption = null,
  placeholder,
  allOptionLabel,
  id,
  invalid,
  disabled,
}: AsyncComboboxProps) {
  const t = useTranslations("ui.asyncCombobox");
  // A route handler lives outside the `[locale]` segment and cannot resolve a
  // locale of its own, so the category endpoint is told which one to
  // translate preset names into. See `.claude/rules/i18n.md`.
  const locale = useLocale();

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<ComboboxOption[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  // Aborts the request a new search supersedes, so a slow page 1 cannot land
  // after the page 1 of a later query and overwrite it.
  const abortRef = useRef<AbortController | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(
    async (nextPage: number, query: string, mode: "replace" | "append") => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStatus("loading");

      try {
        const params = new URLSearchParams({
          q: query,
          page: String(nextPage),
          locale,
        });
        const response = await fetch(`${endpoint}?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Options request failed: ${response.status}`);

        const body = (await response.json()) as OptionsResponse;

        setItems((current) => (mode === "append" ? [...current, ...body.items] : body.items));
        setHasMore(body.hasMore);
        setPage(nextPage);
        setStatus("idle");
      } catch (error) {
        if (controller.signal.aborted) return;
        setStatus("error");
      }
    },
    [endpoint, locale],
  );

  // First page on open, and a fresh first page whenever the search settles.
  // The 300ms wait is what keeps a three-letter query to one request.
  useEffect(() => {
    if (!open) return undefined;

    const timer = setTimeout(() => {
      void load(1, search, "replace");
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [open, search, load]);

  // Appends the next page when the sentinel row scrolls into the popup.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!open || !sentinel || !hasMore || status === "loading") return undefined;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void load(page + 1, search, "append");
      }
    });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [open, hasMore, status, page, search, load]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const allOption: ComboboxOption[] = allOptionLabel
    ? [{ id: ALL_OPTION_ID, name: allOptionLabel }]
    : [];

  // A preselected option may not be in the current page of results; keeping it
  // in the list is what lets Base UI render its label in the input.
  const knownOption =
    selectedOption && !items.some((item) => item.id === selectedOption.id) ? [selectedOption] : [];

  const listItems = [...allOption, ...knownOption, ...items];
  const currentValue = listItems.find((item) => item.id === (value ?? ALL_OPTION_ID)) ?? null;

  return (
    <Combobox.Root<ComboboxOption>
      items={listItems}
      // Filtering happens on the server; filtering again here would hide rows
      // the endpoint deliberately returned.
      filter={null}
      value={currentValue}
      onValueChange={(next) => onValueChange(next && next.id !== ALL_OPTION_ID ? next.id : null)}
      inputValue={undefined}
      onInputValueChange={(next) => setSearch(next)}
      itemToStringLabel={(item) => item.name}
      isItemEqualToValue={(item, other) => item.id === other.id}
      open={open}
      onOpenChange={setOpen}
      disabled={disabled}
    >
      <Combobox.Input
        id={id}
        placeholder={placeholder}
        aria-invalid={invalid ? true : undefined}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none",
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "lg:h-11 lg:text-base",
        )}
      />

      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} className="z-50">
          <Combobox.Popup className="max-h-64 w-[var(--anchor-width)] overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
            {status === "error" ? (
              <p className="px-2 py-3 text-sm text-destructive">{t("error")}</p>
            ) : (
              <>
                <Combobox.Empty className="px-2 py-3 text-sm text-muted-foreground">
                  {status === "loading" ? t("loading") : t("empty")}
                </Combobox.Empty>

                <Combobox.List>
                  {(item: ComboboxOption) => (
                    <Combobox.Item
                      key={item.id}
                      value={item}
                      className="flex cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent"
                    >
                      {item.name}
                    </Combobox.Item>
                  )}
                </Combobox.List>

                {hasMore && (
                  <div ref={sentinelRef} className="px-2 py-1.5 text-sm text-muted-foreground">
                    {t("loadingMore")}
                  </div>
                )}
              </>
            )}
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
```

- [ ] **Step 4: Run the tests, and reconcile against the real Base UI API**

Run: `npx vitest run src/components/ui/async-combobox.spec.tsx`
Expected: PASS, 12 tests.

If a prop name or part is wrong, the failure names it. Check the actual declarations before changing anything:

```bash
grep -rn "ComboboxRootProps" -A 40 node_modules/@base-ui/react/combobox/root/ComboboxRoot.d.ts | head -60
ls node_modules/@base-ui/react/combobox
```

Fix the **imports and prop names** to match; do not change the behaviour the tests assert.

- [ ] **Step 5: Lint and typecheck**

Run: `npx tsc --noEmit && npm run lint`
Expected: pass. The React Compiler lint rule rejects some patterns — if `load` trips it, keep the `useCallback` and check the dependency array rather than reaching for a disable comment.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/async-combobox.tsx src/components/ui/async-combobox.spec.tsx
git commit -m "feat(ui): add a debounced, paginated async combobox"
```

---

## Task 13: The date picker

**Files:**
- Create: `src/components/ui/date-picker.tsx`
- Test: `src/components/ui/date-picker.spec.tsx`

**Interfaces:**
- Consumes: `Calendar`, `Popover` from Task 10; `formatDate` from `@/lib/format`; `ISO_DATE_PATTERN`, `toIsoDate`, `toUtcMidnight` from `@/lib/dates`; `ui.datePicker.*` copy.
- Produces:
  ```ts
  type DatePickerProps = {
    /** `YYYY-MM-DD`, or "" for no selection. */
    value: string;
    onValueChange: (value: string) => void;
    dateFormat: DateFormat;
    id?: string;
    invalid?: boolean;
    disabled?: boolean;
  };
  export function DatePicker(props: DatePickerProps): React.JSX.Element;
  ```

The value crossing this component's boundary is always a `YYYY-MM-DD` string — the same shape the schemas validate and the actions store — so no `Date` is ever handed to a Server Action.

- [ ] **Step 1: Write the failing tests**

Create `src/components/ui/date-picker.spec.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithIntl } from "@/test-utils/intl";
import { DatePicker } from "@/components/ui/date-picker";

const render = (props: Partial<Parameters<typeof DatePicker>[0]> = {}) =>
  renderWithIntl(
    <DatePicker value="2026-08-14" onValueChange={() => {}} dateFormat="MDY" {...props} />,
  );

describe("DatePicker", () => {
  it("labels the trigger with the user's date format, not the browser's", () => {
    render({ dateFormat: "DMY" });

    expect(screen.getByRole("button")).toHaveTextContent("14/08/2026");
  });

  it("shows a placeholder when nothing is selected", () => {
    render({ value: "" });

    expect(screen.getByRole("button")).toHaveTextContent("Pick a date");
  });

  it("reports the chosen day as a YYYY-MM-DD string", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render({ onValueChange });

    await user.click(screen.getByRole("button"));
    await user.click(await screen.findByRole("button", { name: /^20$/ }));

    expect(onValueChange).toHaveBeenCalledWith("2026-08-20");
  });

  // The stored value is UTC midnight; a local-time round trip would shift the
  // day for anyone west of UTC.
  it("round-trips a date without shifting the day", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render({ value: "2026-03-01", onValueChange });

    await user.click(screen.getByRole("button"));
    await user.click(await screen.findByRole("button", { name: /^1$/ }));

    expect(onValueChange).toHaveBeenCalledWith("2026-03-01");
  });

  it("marks itself invalid for the form to describe", () => {
    render({ invalid: true });

    expect(screen.getByRole("button")).toHaveAttribute("aria-invalid", "true");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/ui/date-picker.spec.tsx`
Expected: FAIL — cannot resolve `@/components/ui/date-picker`.

- [ ] **Step 3: Implement**

Create `src/components/ui/date-picker.tsx`:

```tsx
"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { useTranslations } from "next-intl";

import type { DateFormat } from "@/generated/prisma/enums";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toIsoDate, toUtcMidnight } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type DatePickerProps = {
  /** `YYYY-MM-DD`, or "" for no selection. */
  value: string;
  onValueChange: (value: string) => void;
  dateFormat: DateFormat;
  id?: string;
  invalid?: boolean;
  disabled?: boolean;
};

/**
 * The value in and out is always a `YYYY-MM-DD` string — the shape the
 * schemas validate and the actions store. `Date` exists only inside this
 * component, where `Calendar` requires one, and it is always UTC midnight so
 * a user west of UTC cannot land on the previous day.
 */
export function DatePicker({
  value,
  onValueChange,
  dateFormat,
  id,
  invalid,
  disabled,
}: DatePickerProps) {
  const t = useTranslations("ui.datePicker");
  const [open, setOpen] = useState(false);

  const selected = value ? toUtcMidnight(value) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-invalid={invalid ? true : undefined}
            aria-label={t("open")}
            className={cn(
              "w-full justify-start font-normal lg:h-11 lg:text-base",
              !value && "text-muted-foreground",
            )}
          />
        }
      >
        <CalendarDays data-icon="inline-start" aria-hidden="true" />
        {value ? formatDate(selected!, dateFormat) : t("placeholder")}
      </PopoverTrigger>

      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(next?: Date) => {
            if (!next) return;
            // `Calendar` hands back a local-midnight Date; rebuilding it from
            // its local Y/M/D is what keeps the day the user clicked.
            onValueChange(
              toIsoDate(
                new Date(Date.UTC(next.getFullYear(), next.getMonth(), next.getDate())),
              ),
            );
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/ui/date-picker.spec.tsx`
Expected: PASS, 5 tests. If `Calendar`'s props differ from the registry's output (`mode`/`selected`/`onSelect` come from `react-day-picker`), check `src/components/ui/calendar.tsx` and adapt the props — not the behaviour.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/date-picker.tsx src/components/ui/date-picker.spec.tsx
git commit -m "feat(ui): add a date picker driven by the user's date format"
```

---

## Task 14: One-off transaction actions

**Files:**
- Create: `src/lib/actions/references.ts`
- Create: `src/lib/actions/action-helpers.ts`
- Create: `src/lib/actions/transactions.ts`
- Test: `src/lib/actions/transactions.spec.ts`

**Interfaces:**
- Consumes: `createTransactionSchema`, `TransactionValues`, `TRANSACTION_ID_MAX_LENGTH`; `toUtcMidnight`.
- Produces:
  - `ownsReferences(userId: string, categoryId: string, cardId: string | null): Promise<boolean>` (from `references.ts`)
  - From `action-helpers.ts`: `type ActionResult = { success: true } | { success: false; error: string }`, `transactionIdSchema`, `getSessionUserId()`, `resolveLocale(locale)`, `notFoundError(locale)`, `invalidInputError(locale)` — shared by all three action files in Tasks 14–16
  - `createTransaction(values: TransactionValues, locale: string): Promise<ActionResult>`
  - `updateTransaction(id: string, values: TransactionValues, locale: string): Promise<ActionResult>` — also what the installment occurrences table calls
  - `deleteTransaction(id: string, locale: string): Promise<ActionResult>`

- [ ] **Step 1: Read the reference implementation**

Read `src/lib/actions/cards.ts` end to end. This task follows it exactly: the `getSessionUserId` / `resolveLocale` / `notFoundError` / `invalidInputError` helpers, the generic error that never leaks a zod message, and the trailing `locale` argument.

- [ ] **Step 2: Write the failing tests**

Create `src/lib/actions/transactions.spec.ts`:

```ts
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    transaction: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    category: { findFirst: vi.fn() },
    card: { findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn() }));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { createTransaction, deleteTransaction, updateTransaction } from "@/lib/actions/transactions";
import type { TransactionValues } from "@/lib/validations/transaction";

const t = (key: string, values?: Record<string, unknown>) =>
  values ? `${key}:${JSON.stringify(values)}` : key;

const SESSION = { user: { id: "user-1" }, session: {} };
const LOCALE = "en-US";

const validValues: TransactionValues = {
  type: "EXPENSE",
  amount: "120.50",
  categoryId: "cat-1",
  cardId: "card-1",
  description: "Groceries",
  date: "2026-08-14",
  isPaid: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTranslations).mockResolvedValue(t as never);
  vi.mocked(headers).mockResolvedValue(new Headers());
  vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);
  vi.mocked(prisma.category.findFirst).mockResolvedValue({ id: "cat-1" } as never);
  vi.mocked(prisma.card.findFirst).mockResolvedValue({ id: "card-1" } as never);
});

describe("createTransaction", () => {
  it("refuses and writes nothing without a session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never);

    expect(await createTransaction(validValues, LOCALE)).toEqual({
      success: false,
      error: "notFound",
    });
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it("returns the generic error, never zod's text, for a bad payload", async () => {
    const result = await createTransaction({ ...validValues, amount: "-3" }, LOCALE);

    expect(result).toEqual({ success: false, error: "invalidInput" });
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it("stores the amount as the string it validated, never a float", async () => {
    await createTransaction({ ...validValues, amount: "0.10" }, LOCALE);

    expect(vi.mocked(prisma.transaction.create).mock.calls[0][0].data.amount).toBe("0.10");
  });

  it("normalizes the date to UTC midnight", async () => {
    await createTransaction(validValues, LOCALE);

    expect(
      (vi.mocked(prisma.transaction.create).mock.calls[0][0].data.date as Date).toISOString(),
    ).toBe("2026-08-14T00:00:00.000Z");
  });

  it("never sets recurringTransactionId — this action makes one-offs only", async () => {
    await createTransaction(validValues, LOCALE);

    expect(
      "recurringTransactionId" in vi.mocked(prisma.transaction.create).mock.calls[0][0].data,
    ).toBe(false);
  });

  // The client sends these ids; the server decides whether they are the
  // caller's to use.
  it("refuses a category belonging to someone else", async () => {
    vi.mocked(prisma.category.findFirst).mockResolvedValue(null as never);

    expect(await createTransaction(validValues, LOCALE)).toEqual({
      success: false,
      error: "invalidInput",
    });
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it("refuses a card belonging to someone else", async () => {
    vi.mocked(prisma.card.findFirst).mockResolvedValue(null as never);

    expect(await createTransaction(validValues, LOCALE)).toEqual({
      success: false,
      error: "invalidInput",
    });
  });

  it("looks up references scoped to the user and to active rows", async () => {
    await createTransaction(validValues, LOCALE);

    expect(prisma.category.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "cat-1", userId: "user-1", deactivatedAt: null },
      }),
    );
  });

  it("does not look up a card when there is none", async () => {
    await createTransaction({ ...validValues, type: "INCOME", cardId: null }, LOCALE);

    expect(prisma.card.findFirst).not.toHaveBeenCalled();
  });

  it("revalidates the list", async () => {
    await createTransaction(validValues, LOCALE);

    expect(revalidatePath).toHaveBeenCalledWith("/[locale]/transactions", "page");
  });

  it("forwards the locale to the translator", async () => {
    await createTransaction({ ...validValues, amount: "x" }, "pt-BR");

    expect(getTranslations).toHaveBeenCalledWith(
      expect.objectContaining({ locale: "pt-BR" }),
    );
  });

  it("falls back to the default locale for an unsupported one", async () => {
    await createTransaction({ ...validValues, amount: "x" }, "fr-CA");

    expect(getTranslations).toHaveBeenCalledWith(
      expect.objectContaining({ locale: "en-US" }),
    );
  });
});

describe("updateTransaction", () => {
  beforeEach(() => {
    vi.mocked(prisma.transaction.findFirst).mockResolvedValue({ id: "tx-1" } as never);
  });

  it("refuses an id that is not the caller's", async () => {
    vi.mocked(prisma.transaction.findFirst).mockResolvedValue(null as never);

    expect(await updateTransaction("tx-1", validValues, LOCALE)).toEqual({
      success: false,
      error: "notFound",
    });
    expect(prisma.transaction.update).not.toHaveBeenCalled();
  });

  it("scopes the ownership lookup to the session user", async () => {
    await updateTransaction("tx-1", validValues, LOCALE);

    expect(prisma.transaction.findFirst).toHaveBeenCalledWith({
      where: { id: "tx-1", userId: "user-1" },
    });
  });

  it("refuses an over-long id before touching the database", async () => {
    expect(await updateTransaction("t".repeat(31), validValues, LOCALE)).toEqual({
      success: false,
      error: "notFound",
    });
    expect(prisma.transaction.findFirst).not.toHaveBeenCalled();
  });

  // The installment occurrences table edits a generated row through this
  // action; it must not refuse one for having a parent.
  it("updates a row generated by a recurrence", async () => {
    vi.mocked(prisma.transaction.findFirst).mockResolvedValue({
      id: "tx-1",
      recurringTransactionId: "rec-1",
    } as never);

    expect(await updateTransaction("tx-1", validValues, LOCALE)).toEqual({ success: true });
    expect(prisma.transaction.update).toHaveBeenCalled();
  });
});

describe("deleteTransaction", () => {
  beforeEach(() => {
    vi.mocked(prisma.transaction.findFirst).mockResolvedValue({ id: "tx-1" } as never);
  });

  it("soft-deletes rather than removing the row", async () => {
    expect(await deleteTransaction("tx-1", LOCALE)).toEqual({ success: true });

    const call = vi.mocked(prisma.transaction.update).mock.calls[0][0];
    expect(call.where).toEqual({ id: "tx-1" });
    expect(call.data.deactivatedAt).toBeInstanceOf(Date);
    expect(prisma.transaction).not.toHaveProperty("delete");
  });

  it("refuses an id that is not the caller's", async () => {
    vi.mocked(prisma.transaction.findFirst).mockResolvedValue(null as never);

    expect(await deleteTransaction("tx-1", LOCALE)).toEqual({
      success: false,
      error: "notFound",
    });
    expect(prisma.transaction.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/lib/actions/transactions.spec.ts`
Expected: FAIL — cannot resolve `@/lib/actions/transactions`.

- [ ] **Step 4: Implement the shared reference check**

Create `src/lib/actions/references.ts`:

```ts
import { prisma } from "@/lib/prisma";

/**
 * A `categoryId`/`cardId` arrives off a POST body like any other argument, so
 * being a real id is not enough — it has to be one of *this* user's, and
 * still active. A soft-deleted category must not become newly referenced.
 *
 * Returns false for "not yours", "doesn't exist", and "deactivated" alike;
 * the caller turns all three into the same generic error.
 */
export async function ownsReferences(
  userId: string,
  categoryId: string,
  cardId: string | null,
): Promise<boolean> {
  const [category, card] = await Promise.all([
    prisma.category.findFirst({
      where: { id: categoryId, userId, deactivatedAt: null },
      select: { id: true },
    }),
    cardId
      ? prisma.card.findFirst({
          where: { id: cardId, userId, deactivatedAt: null },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  if (!category) return false;
  return !cardId || Boolean(card);
}
```

- [ ] **Step 5: Implement the shared action helpers**

Create `src/lib/actions/action-helpers.ts` — **without** a `"use server"`
directive. All three action files in Tasks 14–16 import from it:

```ts
import { headers } from "next/headers";
import { hasLocale, type Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { routing } from "@/i18n/routing";
import { auth } from "@/lib/auth";
import { TRANSACTION_ID_MAX_LENGTH } from "@/lib/validations/transaction";

/**
 * Deliberately not a `"use server"` module. Every export of one becomes a
 * callable Server Action endpoint, so these helpers could not live beside
 * the actions without being exposed over the network — and each action file
 * would have to re-declare all five. `cards.ts` and `categories.ts` predate
 * this file and still carry their own copies; leave them be.
 */
export type ActionResult = { success: true } | { success: false; error: string };

/** An id arrives deserialized straight from an attacker-controlled POST body. */
export const transactionIdSchema = z.string().trim().min(1).max(TRANSACTION_ID_MAX_LENGTH);

/**
 * Re-derives identity from the session on every call — never trust a
 * client-supplied id's ownership.
 */
export async function getSessionUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

/**
 * Every action takes the active `locale` as its last argument — see the
 * header comment in `src/lib/actions/cards.ts` for why `getLocale()` throws
 * inside a Server Action and why the `NEXT_LOCALE` cookie cannot stand in.
 */
export function resolveLocale(locale: string): Locale {
  return hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
}

/** One message for "no session", "not yours", and "doesn't exist" alike. */
export async function notFoundError(locale: string): Promise<ActionResult> {
  const t = await getTranslations({ locale: resolveLocale(locale), namespace: "transactions" });
  return { success: false, error: t("notFound") };
}

/**
 * Never surfaces `parsed.error.issues[0].message`: a forged payload of the
 * wrong *type* fails zod's own check first and would reach the UI as
 * hardcoded English.
 */
export async function invalidInputError(locale: string): Promise<ActionResult> {
  const t = await getTranslations({ locale: resolveLocale(locale), namespace: "transactions" });
  return { success: false, error: t("invalidInput") };
}
```

- [ ] **Step 6: Implement the actions**

Create `src/lib/actions/transactions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import {
  getSessionUserId,
  invalidInputError,
  notFoundError,
  resolveLocale,
  transactionIdSchema,
  type ActionResult,
} from "@/lib/actions/action-helpers";
import { ownsReferences } from "@/lib/actions/references";
import { toUtcMidnight } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import {
  createTransactionSchema,
  type TransactionValues,
} from "@/lib/validations/transaction";

async function parseValues(values: TransactionValues, locale: string) {
  const t = await getTranslations({
    locale: resolveLocale(locale),
    namespace: "validation.transactions",
  });
  return createTransactionSchema(t).safeParse(values);
}

export async function createTransaction(
  values: TransactionValues,
  locale: string,
): Promise<ActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return notFoundError(locale);

  const parsed = await parseValues(values, locale);
  if (!parsed.success) return invalidInputError(locale);

  if (!(await ownsReferences(userId, parsed.data.categoryId, parsed.data.cardId))) {
    return invalidInputError(locale);
  }

  await prisma.transaction.create({
    data: {
      userId,
      categoryId: parsed.data.categoryId,
      cardId: parsed.data.cardId,
      type: parsed.data.type,
      // A string, straight into the Decimal column: money never becomes a float.
      amount: parsed.data.amount,
      description: parsed.data.description,
      date: toUtcMidnight(parsed.data.date),
      isPaid: parsed.data.isPaid,
    },
  });

  revalidatePath("/[locale]/transactions", "page");
  return { success: true };
}

/**
 * Also the action the installment occurrences table calls. A generated row is
 * updated here exactly like a one-off — its `recurringTransactionId` is left
 * alone, so it stays part of its series.
 */
export async function updateTransaction(
  id: string,
  values: TransactionValues,
  locale: string,
): Promise<ActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return notFoundError(locale);
  if (!transactionIdSchema.safeParse(id).success) return notFoundError(locale);

  const parsed = await parseValues(values, locale);
  if (!parsed.success) return invalidInputError(locale);

  if (!(await ownsReferences(userId, parsed.data.categoryId, parsed.data.cardId))) {
    return invalidInputError(locale);
  }

  const transaction = await prisma.transaction.findFirst({ where: { id, userId } });
  if (!transaction) return notFoundError(locale);

  await prisma.transaction.update({
    where: { id },
    data: {
      categoryId: parsed.data.categoryId,
      cardId: parsed.data.cardId,
      type: parsed.data.type,
      amount: parsed.data.amount,
      description: parsed.data.description,
      date: toUtcMidnight(parsed.data.date),
      isPaid: parsed.data.isPaid,
    },
  });

  revalidatePath("/[locale]/transactions", "page");
  return { success: true };
}

export async function deleteTransaction(id: string, locale: string): Promise<ActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return notFoundError(locale);
  if (!transactionIdSchema.safeParse(id).success) return notFoundError(locale);

  const transaction = await prisma.transaction.findFirst({ where: { id, userId } });
  if (!transaction) return notFoundError(locale);

  // Soft delete, never a hard one — this row is financial history, and
  // `Category`/`Card` reference it with `onDelete: Restrict`.
  await prisma.transaction.update({ where: { id }, data: { deactivatedAt: new Date() } });

  revalidatePath("/[locale]/transactions", "page");
  return { success: true };
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/lib/actions/transactions.spec.ts`
Expected: PASS, 19 tests.

- [ ] **Step 8: Commit**

```bash
git add src/lib/actions/references.ts src/lib/actions/action-helpers.ts src/lib/actions/transactions.ts src/lib/actions/transactions.spec.ts
git commit -m "feat(transactions): add one-off transaction actions"
```

---

## Task 15: Ongoing recurrence actions

**Files:**
- Create: `src/lib/actions/recurring-transactions.ts`
- Test: `src/lib/actions/recurring-transactions.spec.ts`

**Interfaces:**
- Consumes: `createRecurringTransactionSchema`, `RecurringTransactionValues`; `ownsReferences`; `toUtcMidnight`.
- Produces:
  - `createRecurringTransaction(values: RecurringTransactionValues, locale: string): Promise<ActionResult>`
  - `updateRecurringTransaction(id: string, values: RecurringTransactionValues, locale: string): Promise<ActionResult>`
  - `deleteRecurringTransaction(id: string, locale: string): Promise<ActionResult>`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/actions/recurring-transactions.spec.ts`:

```ts
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    recurringTransaction: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    transaction: { createMany: vi.fn() },
    category: { findFirst: vi.fn() },
    card: { findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn() }));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import {
  createRecurringTransaction,
  deleteRecurringTransaction,
  updateRecurringTransaction,
} from "@/lib/actions/recurring-transactions";
import type { RecurringTransactionValues } from "@/lib/validations/recurring-transaction";

const t = (key: string, values?: Record<string, unknown>) =>
  values ? `${key}:${JSON.stringify(values)}` : key;

const SESSION = { user: { id: "user-1" }, session: {} };
const LOCALE = "en-US";

const validValues: RecurringTransactionValues = {
  type: "EXPENSE",
  amount: "19.90",
  categoryId: "cat-1",
  cardId: "card-1",
  description: "Netflix",
  startDate: "2026-01-05",
  frequency: "MONTHLY",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTranslations).mockResolvedValue(t as never);
  vi.mocked(headers).mockResolvedValue(new Headers());
  vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);
  vi.mocked(prisma.category.findFirst).mockResolvedValue({ id: "cat-1" } as never);
  vi.mocked(prisma.card.findFirst).mockResolvedValue({ id: "card-1" } as never);
});

describe("createRecurringTransaction", () => {
  it("refuses without a session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never);

    expect(await createRecurringTransaction(validValues, LOCALE)).toEqual({
      success: false,
      error: "notFound",
    });
    expect(prisma.recurringTransaction.create).not.toHaveBeenCalled();
  });

  it("refuses a category that is not the caller's", async () => {
    vi.mocked(prisma.category.findFirst).mockResolvedValue(null as never);

    expect(await createRecurringTransaction(validValues, LOCALE)).toEqual({
      success: false,
      error: "invalidInput",
    });
  });

  // The three columns that make this an *ongoing* recurrence rather than a
  // plan, per the schema's own comments.
  it("marks the row ongoing: no fixed count, nothing generated, a cron cue set", async () => {
    await createRecurringTransaction(validValues, LOCALE);

    const { data } = vi.mocked(prisma.recurringTransaction.create).mock.calls[0][0];
    expect(data.fixedOccurrencesCount).toBe(false);
    expect(data.occurrencesCount).toBe(0);
    expect((data.nextRunDate as Date).toISOString()).toBe("2026-01-05T00:00:00.000Z");
  });

  it("generates no transactions — that is a later feature's job", async () => {
    await createRecurringTransaction(validValues, LOCALE);

    expect(prisma.transaction.createMany).not.toHaveBeenCalled();
  });

  it("normalizes the start date to UTC midnight", async () => {
    await createRecurringTransaction(validValues, LOCALE);

    const { data } = vi.mocked(prisma.recurringTransaction.create).mock.calls[0][0];
    expect((data.startDate as Date).toISOString()).toBe("2026-01-05T00:00:00.000Z");
  });

  it("revalidates the list", async () => {
    await createRecurringTransaction(validValues, LOCALE);

    expect(revalidatePath).toHaveBeenCalledWith("/[locale]/transactions", "page");
  });
});

describe("updateRecurringTransaction", () => {
  beforeEach(() => {
    vi.mocked(prisma.recurringTransaction.findFirst).mockResolvedValue({ id: "rec-1" } as never);
  });

  it("refuses an id that is not the caller's", async () => {
    vi.mocked(prisma.recurringTransaction.findFirst).mockResolvedValue(null as never);

    expect(await updateRecurringTransaction("rec-1", validValues, LOCALE)).toEqual({
      success: false,
      error: "notFound",
    });
    expect(prisma.recurringTransaction.update).not.toHaveBeenCalled();
  });

  // An installment plan is edited through its own action, which also rewrites
  // its occurrences. Letting this one touch a plan would change the
  // definition and leave every generated row behind.
  it("refuses to edit an installment plan", async () => {
    vi.mocked(prisma.recurringTransaction.findFirst).mockResolvedValue({
      id: "rec-1",
      fixedOccurrencesCount: true,
    } as never);

    expect(await updateRecurringTransaction("rec-1", validValues, LOCALE)).toEqual({
      success: false,
      error: "notFound",
    });
    expect(prisma.recurringTransaction.update).not.toHaveBeenCalled();
  });

  it("keeps the cron cue in step with a changed start date", async () => {
    await updateRecurringTransaction(
      "rec-1",
      { ...validValues, startDate: "2026-03-09" },
      LOCALE,
    );

    const { data } = vi.mocked(prisma.recurringTransaction.update).mock.calls[0][0];
    expect((data.nextRunDate as Date).toISOString()).toBe("2026-03-09T00:00:00.000Z");
  });
});

describe("deleteRecurringTransaction", () => {
  beforeEach(() => {
    vi.mocked(prisma.recurringTransaction.findFirst).mockResolvedValue({ id: "rec-1" } as never);
  });

  it("soft-deletes the definition", async () => {
    expect(await deleteRecurringTransaction("rec-1", LOCALE)).toEqual({ success: true });

    const call = vi.mocked(prisma.recurringTransaction.update).mock.calls[0][0];
    expect(call.where).toEqual({ id: "rec-1" });
    expect(call.data.deactivatedAt).toBeInstanceOf(Date);
  });

  it("refuses an id that is not the caller's", async () => {
    vi.mocked(prisma.recurringTransaction.findFirst).mockResolvedValue(null as never);

    expect(await deleteRecurringTransaction("rec-1", LOCALE)).toEqual({
      success: false,
      error: "notFound",
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/actions/recurring-transactions.spec.ts`
Expected: FAIL — cannot resolve the module.

- [ ] **Step 3: Implement**

Create `src/lib/actions/recurring-transactions.ts`. It imports the five shared helpers from `@/lib/actions/action-helpers` (Task 14) rather than re-declaring them — `transactionIdSchema`, `getSessionUserId`, `resolveLocale`, `notFoundError`, `invalidInputError`, plus the `ActionResult` type — and `ownsReferences` from `@/lib/actions/references`. Then:

```ts
async function parseValues(values: RecurringTransactionValues, locale: string) {
  const t = await getTranslations({
    locale: resolveLocale(locale),
    namespace: "validation.transactions",
  });
  return createRecurringTransactionSchema(t).safeParse(values);
}

export async function createRecurringTransaction(
  values: RecurringTransactionValues,
  locale: string,
): Promise<ActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return notFoundError(locale);

  const parsed = await parseValues(values, locale);
  if (!parsed.success) return invalidInputError(locale);

  if (!(await ownsReferences(userId, parsed.data.categoryId, parsed.data.cardId))) {
    return invalidInputError(locale);
  }

  const startDate = toUtcMidnight(parsed.data.startDate);

  await prisma.recurringTransaction.create({
    data: {
      userId,
      categoryId: parsed.data.categoryId,
      cardId: parsed.data.cardId,
      type: parsed.data.type,
      amount: parsed.data.amount,
      description: parsed.data.description,
      frequency: parsed.data.frequency,
      startDate,
      // Ongoing: nothing is generated here, so the count starts at zero and
      // `nextRunDate` carries the first due date for the cron that will grow
      // this series later.
      fixedOccurrencesCount: false,
      occurrencesCount: 0,
      nextRunDate: startDate,
    },
  });

  revalidatePath("/[locale]/transactions", "page");
  return { success: true };
}

export async function updateRecurringTransaction(
  id: string,
  values: RecurringTransactionValues,
  locale: string,
): Promise<ActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return notFoundError(locale);
  if (!transactionIdSchema.safeParse(id).success) return notFoundError(locale);

  const parsed = await parseValues(values, locale);
  if (!parsed.success) return invalidInputError(locale);

  if (!(await ownsReferences(userId, parsed.data.categoryId, parsed.data.cardId))) {
    return invalidInputError(locale);
  }

  // An installment plan is edited through `updateInstallmentSeries`, which
  // also rewrites its generated rows. Editing one here would change the
  // definition and silently leave every occurrence behind.
  const recurring = await prisma.recurringTransaction.findFirst({
    where: { id, userId, fixedOccurrencesCount: false },
  });
  if (!recurring) return notFoundError(locale);

  const startDate = toUtcMidnight(parsed.data.startDate);

  await prisma.recurringTransaction.update({
    where: { id },
    data: {
      categoryId: parsed.data.categoryId,
      cardId: parsed.data.cardId,
      type: parsed.data.type,
      amount: parsed.data.amount,
      description: parsed.data.description,
      frequency: parsed.data.frequency,
      startDate,
      nextRunDate: startDate,
    },
  });

  revalidatePath("/[locale]/transactions", "page");
  return { success: true };
}

export async function deleteRecurringTransaction(
  id: string,
  locale: string,
): Promise<ActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return notFoundError(locale);
  if (!transactionIdSchema.safeParse(id).success) return notFoundError(locale);

  const recurring = await prisma.recurringTransaction.findFirst({
    where: { id, userId, fixedOccurrencesCount: false },
  });
  if (!recurring) return notFoundError(locale);

  // Only the definition. Any rows it generated stay as history — that is what
  // `onDelete: SetNull` on `Transaction.recurringTransactionId` is for, and
  // nothing here is hard-deleted anyway.
  await prisma.recurringTransaction.update({
    where: { id },
    data: { deactivatedAt: new Date() },
  });

  revalidatePath("/[locale]/transactions", "page");
  return { success: true };
}
```

Note the ownership lookups carry `fixedOccurrencesCount: false` — a plan id reaching these actions gets the same generic not-found as someone else's id.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/actions/recurring-transactions.spec.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/recurring-transactions.ts src/lib/actions/recurring-transactions.spec.ts
git commit -m "feat(transactions): add ongoing recurrence actions"
```

---

## Task 16: Installment plan actions

**Files:**
- Create: `src/lib/actions/installments.ts`
- Test: `src/lib/actions/installments.spec.ts`

**Interfaces:**
- Consumes: `createInstallmentSchema`, `createInstallmentSeriesSchema`, `InstallmentValues`, `InstallmentSeriesValues`; `occurrenceDates`; `ownsReferences`; `toUtcMidnight`.
- Produces:
  - `createInstallmentPlan(values: InstallmentValues, locale: string): Promise<ActionResult>`
  - `updateInstallmentSeries(id: string, values: InstallmentSeriesValues, locale: string): Promise<ActionResult>`
  - `deleteInstallmentPlan(id: string, locale: string): Promise<ActionResult>`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/actions/installments.spec.ts`:

```ts
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = {
  recurringTransaction: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
  transaction: { createMany: vi.fn(), updateMany: vi.fn() },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    recurringTransaction: { findFirst: vi.fn() },
    category: { findFirst: vi.fn() },
    card: { findFirst: vi.fn() },
    // Runs the callback with the same mocked delegates, so the assertions
    // below see the writes the transaction would have made.
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  },
}));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn() }));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import {
  createInstallmentPlan,
  deleteInstallmentPlan,
  updateInstallmentSeries,
} from "@/lib/actions/installments";
import { MAX_INSTALLMENT_OCCURRENCES } from "@/lib/transactions/occurrences";
import type { InstallmentValues } from "@/lib/validations/installment";

const t = (key: string, values?: Record<string, unknown>) =>
  values ? `${key}:${JSON.stringify(values)}` : key;

const SESSION = { user: { id: "user-1" }, session: {} };
const LOCALE = "en-US";

const validValues: InstallmentValues = {
  type: "EXPENSE",
  amount: "89.00",
  categoryId: "cat-1",
  cardId: "card-1",
  description: "Gym",
  startDate: "2026-01-05",
  frequency: "MONTHLY",
  occurrencesCount: 12,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTranslations).mockResolvedValue(t as never);
  vi.mocked(headers).mockResolvedValue(new Headers());
  vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);
  vi.mocked(prisma.category.findFirst).mockResolvedValue({ id: "cat-1" } as never);
  vi.mocked(prisma.card.findFirst).mockResolvedValue({ id: "card-1" } as never);
  tx.recurringTransaction.create.mockResolvedValue({ id: "plan-1" });
  tx.transaction.createMany.mockResolvedValue({ count: 12 });
  tx.recurringTransaction.update.mockResolvedValue({ id: "plan-1" });
  tx.transaction.updateMany.mockResolvedValue({ count: 12 });
});

describe("createInstallmentPlan", () => {
  it("refuses without a session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never);

    expect(await createInstallmentPlan(validValues, LOCALE)).toEqual({
      success: false,
      error: "notFound",
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses a count over the maximum", async () => {
    expect(
      await createInstallmentPlan(
        { ...validValues, occurrencesCount: MAX_INSTALLMENT_OCCURRENCES + 1 },
        LOCALE,
      ),
    ).toEqual({ success: false, error: "invalidInput" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // The definition and its rows are written together or not at all.
  it("writes the plan and its rows inside one database transaction", async () => {
    await createInstallmentPlan(validValues, LOCALE);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.recurringTransaction.create).toHaveBeenCalledTimes(1);
    expect(tx.transaction.createMany).toHaveBeenCalledTimes(1);
  });

  it("marks the definition closed: fixed count, final total, no cron cue", async () => {
    await createInstallmentPlan(validValues, LOCALE);

    const { data } = tx.recurringTransaction.create.mock.calls[0][0];
    expect(data.fixedOccurrencesCount).toBe(true);
    expect(data.occurrencesCount).toBe(12);
    expect(data.nextRunDate).toBeNull();
  });

  it("generates one row per occurrence, stepped by the frequency", async () => {
    await createInstallmentPlan(validValues, LOCALE);

    const { data } = tx.transaction.createMany.mock.calls[0][0];
    expect(data).toHaveLength(12);
    expect((data[0].date as Date).toISOString()).toBe("2026-01-05T00:00:00.000Z");
    expect((data[11].date as Date).toISOString()).toBe("2026-12-05T00:00:00.000Z");
  });

  it("points every generated row at its parent, unpaid", async () => {
    await createInstallmentPlan(validValues, LOCALE);

    const { data } = tx.transaction.createMany.mock.calls[0][0];
    expect(data.every((row: { recurringTransactionId: string }) => row.recurringTransactionId === "plan-1")).toBe(true);
    expect(data.every((row: { isPaid: boolean }) => row.isPaid === false)).toBe(true);
    expect(data.every((row: { amount: string }) => row.amount === "89.00")).toBe(true);
  });

  it("clamps month ends rather than drifting the series", async () => {
    await createInstallmentPlan(
      { ...validValues, startDate: "2026-01-31", occurrencesCount: 3 },
      LOCALE,
    );

    const { data } = tx.transaction.createMany.mock.calls[0][0];
    expect(data.map((row: { date: Date }) => row.date.toISOString().slice(0, 10))).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
    ]);
  });

  it("refuses a card that is not the caller's", async () => {
    vi.mocked(prisma.card.findFirst).mockResolvedValue(null as never);

    expect(await createInstallmentPlan(validValues, LOCALE)).toEqual({
      success: false,
      error: "invalidInput",
    });
  });
});

describe("updateInstallmentSeries", () => {
  beforeEach(() => {
    vi.mocked(prisma.recurringTransaction.findFirst).mockResolvedValue({
      id: "plan-1",
      fixedOccurrencesCount: true,
    } as never);
  });

  const seriesValues = { type: "EXPENSE" as const, categoryId: "cat-2", cardId: "card-2" };

  it("refuses an id that is not the caller's", async () => {
    vi.mocked(prisma.recurringTransaction.findFirst).mockResolvedValue(null as never);

    expect(await updateInstallmentSeries("plan-1", seriesValues, LOCALE)).toEqual({
      success: false,
      error: "notFound",
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // These three fields classify the whole series; letting them drift row by
  // row would make the category column meaningless.
  it("writes the series fields to the definition and every live occurrence", async () => {
    await updateInstallmentSeries("plan-1", seriesValues, LOCALE);

    expect(tx.recurringTransaction.update).toHaveBeenCalledWith({
      where: { id: "plan-1" },
      data: { categoryId: "cat-2", cardId: "card-2", type: "EXPENSE" },
    });
    expect(tx.transaction.updateMany).toHaveBeenCalledWith({
      where: { recurringTransactionId: "plan-1", deactivatedAt: null },
      data: { categoryId: "cat-2", cardId: "card-2", type: "EXPENSE" },
    });
  });

  it("leaves the per-occurrence fields alone", async () => {
    await updateInstallmentSeries("plan-1", seriesValues, LOCALE);

    const { data } = tx.transaction.updateMany.mock.calls[0][0];
    for (const field of ["amount", "date", "description", "isPaid"]) {
      expect(field in data).toBe(false);
    }
  });

  it("refuses an ongoing recurrence — that one has its own action", async () => {
    vi.mocked(prisma.recurringTransaction.findFirst).mockResolvedValue(null as never);

    expect(await updateInstallmentSeries("rec-1", seriesValues, LOCALE)).toEqual({
      success: false,
      error: "notFound",
    });
  });
});

describe("deleteInstallmentPlan", () => {
  beforeEach(() => {
    vi.mocked(prisma.recurringTransaction.findFirst).mockResolvedValue({
      id: "plan-1",
      fixedOccurrencesCount: true,
    } as never);
  });

  // The occurrences *are* the plan's representation in the list, so deleting
  // only the definition would appear to do nothing.
  it("soft-deletes the definition and every occurrence together", async () => {
    expect(await deleteInstallmentPlan("plan-1", LOCALE)).toEqual({ success: true });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.recurringTransaction.update.mock.calls[0][0].data.deactivatedAt).toBeInstanceOf(Date);
    expect(tx.transaction.updateMany.mock.calls[0][0].where).toEqual({
      recurringTransactionId: "plan-1",
      deactivatedAt: null,
    });
    expect(tx.transaction.updateMany.mock.calls[0][0].data.deactivatedAt).toBeInstanceOf(Date);
  });

  it("refuses an id that is not the caller's", async () => {
    vi.mocked(prisma.recurringTransaction.findFirst).mockResolvedValue(null as never);

    expect(await deleteInstallmentPlan("plan-1", LOCALE)).toEqual({
      success: false,
      error: "notFound",
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/actions/installments.spec.ts`
Expected: FAIL — cannot resolve `@/lib/actions/installments`.

- [ ] **Step 3: Implement**

Create `src/lib/actions/installments.ts`, importing the same shared helpers from `@/lib/actions/action-helpers`, and:

```ts
async function parseValues(values: InstallmentValues, locale: string) {
  const t = await getTranslations({
    locale: resolveLocale(locale),
    namespace: "validation.transactions",
  });
  return createInstallmentSchema(t).safeParse(values);
}

async function parseSeriesValues(values: InstallmentSeriesValues, locale: string) {
  const t = await getTranslations({
    locale: resolveLocale(locale),
    namespace: "validation.transactions",
  });
  return createInstallmentSeriesSchema(t).safeParse(values);
}

/**
 * Writes the definition and all of its rows in one database transaction: a
 * plan that half-exists is worse than one that failed outright.
 */
export async function createInstallmentPlan(
  values: InstallmentValues,
  locale: string,
): Promise<ActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return notFoundError(locale);

  const parsed = await parseValues(values, locale);
  if (!parsed.success) return invalidInputError(locale);

  if (!(await ownsReferences(userId, parsed.data.categoryId, parsed.data.cardId))) {
    return invalidInputError(locale);
  }

  const dates = occurrenceDates(
    parsed.data.startDate,
    parsed.data.frequency,
    parsed.data.occurrencesCount,
  );

  await prisma.$transaction(async (client) => {
    const plan = await client.recurringTransaction.create({
      data: {
        userId,
        categoryId: parsed.data.categoryId,
        cardId: parsed.data.cardId,
        type: parsed.data.type,
        amount: parsed.data.amount,
        description: parsed.data.description,
        frequency: parsed.data.frequency,
        startDate: toUtcMidnight(parsed.data.startDate),
        // Closed series: the count is final and there is nothing left for a
        // cron to run, so `nextRunDate` stays null.
        fixedOccurrencesCount: true,
        occurrencesCount: parsed.data.occurrencesCount,
        nextRunDate: null,
      },
    });

    await client.transaction.createMany({
      data: dates.map((date) => ({
        userId,
        categoryId: parsed.data.categoryId,
        cardId: parsed.data.cardId,
        type: parsed.data.type,
        amount: parsed.data.amount,
        description: parsed.data.description,
        date,
        isPaid: false,
        recurringTransactionId: plan.id,
      })),
    });
  });

  revalidatePath("/[locale]/transactions", "page");
  return { success: true };
}

/**
 * The series half of the plan edit page. `amount`, `date`, `description`, and
 * `isPaid` are deliberately absent: those belong to each occurrence and are
 * edited row by row through `updateTransaction`.
 */
export async function updateInstallmentSeries(
  id: string,
  values: InstallmentSeriesValues,
  locale: string,
): Promise<ActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return notFoundError(locale);
  if (!transactionIdSchema.safeParse(id).success) return notFoundError(locale);

  const parsed = await parseSeriesValues(values, locale);
  if (!parsed.success) return invalidInputError(locale);

  if (!(await ownsReferences(userId, parsed.data.categoryId, parsed.data.cardId))) {
    return invalidInputError(locale);
  }

  const plan = await prisma.recurringTransaction.findFirst({
    where: { id, userId, fixedOccurrencesCount: true },
  });
  if (!plan) return notFoundError(locale);

  const seriesFields = {
    categoryId: parsed.data.categoryId,
    cardId: parsed.data.cardId,
    type: parsed.data.type,
  };

  await prisma.$transaction(async (client) => {
    await client.recurringTransaction.update({ where: { id }, data: seriesFields });
    await client.transaction.updateMany({
      where: { recurringTransactionId: id, deactivatedAt: null },
      data: seriesFields,
    });
  });

  revalidatePath("/[locale]/transactions", "page");
  return { success: true };
}

/**
 * Unlike an ongoing recurrence, a plan's occurrences *are* how it appears in
 * the list — soft-deleting only the definition would remove nothing the user
 * can see.
 */
export async function deleteInstallmentPlan(id: string, locale: string): Promise<ActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return notFoundError(locale);
  if (!transactionIdSchema.safeParse(id).success) return notFoundError(locale);

  const plan = await prisma.recurringTransaction.findFirst({
    where: { id, userId, fixedOccurrencesCount: true },
  });
  if (!plan) return notFoundError(locale);

  const deactivatedAt = new Date();

  await prisma.$transaction(async (client) => {
    await client.recurringTransaction.update({ where: { id }, data: { deactivatedAt } });
    await client.transaction.updateMany({
      where: { recurringTransactionId: id, deactivatedAt: null },
      data: { deactivatedAt },
    });
  });

  revalidatePath("/[locale]/transactions", "page");
  return { success: true };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/actions/installments.spec.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Run the whole unit suite**

Run: `npm test`
Expected: PASS — nothing in Tasks 2–16 changes existing behaviour.

- [ ] **Step 6: Commit**

```bash
git add src/lib/actions/installments.ts src/lib/actions/installments.spec.ts
git commit -m "feat(transactions): add installment plan actions"
```

---

## Task 17: Navigation and the list page shell

**Files:**
- Create: `src/app/[locale]/(app)/transactions/page.tsx`
- Create: `src/app/[locale]/(app)/transactions/loading.tsx`
- Create: `src/components/transactions/new-transaction-menu.tsx`
- Modify: `src/components/nav/dashboard-nav-menu.tsx`
- Modify: `src/app/[locale]/(app)/layout.tsx`
- Test: `src/components/transactions/new-transaction-menu.spec.tsx`

**Interfaces:**
- Consumes: `dashboard.transactionsNavLabel`, `transactions.*` copy.
- Produces: a reachable, session-guarded `/transactions` page with its header and create menu; `NewTransactionMenu` (no props).

- [ ] **Step 1: Write the failing test for the create menu**

Create `src/components/transactions/new-transaction-menu.spec.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithIntl } from "@/test-utils/intl";
import { NewTransactionMenu } from "@/components/transactions/new-transaction-menu";

describe("NewTransactionMenu", () => {
  it("offers the three kinds, each linking to its own page", async () => {
    const user = userEvent.setup();
    renderWithIntl(<NewTransactionMenu />);

    await user.click(screen.getByRole("button", { name: "New transaction" }));

    expect(await screen.findByRole("link", { name: /One-off transaction/ })).toHaveAttribute(
      "href",
      "/en-US/transactions/new",
    );
    expect(screen.getByRole("link", { name: /Recurring transaction/ })).toHaveAttribute(
      "href",
      "/en-US/transactions/recurring/new",
    );
    expect(screen.getByRole("link", { name: /Installments/ })).toHaveAttribute(
      "href",
      "/en-US/transactions/installments/new",
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/transactions/new-transaction-menu.spec.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the create menu**

Create `src/components/transactions/new-transaction-menu.tsx`:

```tsx
"use client";

import { CalendarSync, Plus, Receipt, Layers } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLinkItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "@/i18n/navigation";

/**
 * Three kinds behind one control, the same way row actions collapse several
 * actions behind an ellipsis rather than lining up buttons
 * (`.claude/rules/ui.md`). Each item carries a one-line hint because
 * "Recurring" and "Installments" are not self-explanatory the first time.
 */
export function NewTransactionMenu() {
  const t = useTranslations("transactions.actions");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button />}>
        <Plus data-icon="inline-start" aria-hidden="true" />
        {t("new")}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="max-w-xs">
        <DropdownMenuLinkItem render={<Link href="/transactions/new" />}>
          <Receipt aria-hidden="true" className="size-6" />
          <span className="flex flex-col">
            <span>{t("newSingle")}</span>
            <span className="text-xs text-muted-foreground">{t("newSingleHint")}</span>
          </span>
        </DropdownMenuLinkItem>

        <DropdownMenuLinkItem render={<Link href="/transactions/recurring/new" />}>
          <CalendarSync aria-hidden="true" className="size-6" />
          <span className="flex flex-col">
            <span>{t("newRecurring")}</span>
            <span className="text-xs text-muted-foreground">{t("newRecurringHint")}</span>
          </span>
        </DropdownMenuLinkItem>

        <DropdownMenuLinkItem render={<Link href="/transactions/installments/new" />}>
          <Layers aria-hidden="true" className="size-6" />
          <span className="flex flex-col">
            <span>{t("newInstallments")}</span>
            <span className="text-xs text-muted-foreground">{t("newInstallmentsHint")}</span>
          </span>
        </DropdownMenuLinkItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 4: Add the sidebar item**

In `src/components/nav/dashboard-nav-menu.tsx`, add a `transactionsLabel` prop, an `ArrowRightLeft` import, an `isTransactionsActive = pathname.startsWith("/transactions")` check, and a `SidebarMenuItem` between Dashboard and Categories, following the three already there exactly (`size-6` icon, `tooltip`, `isActive`, `render={<Link href="/transactions" />}`).

In `src/app/[locale]/(app)/layout.tsx`, pass it: `transactionsLabel={t("transactionsNavLabel")}`.

- [ ] **Step 5: Create the page shell and its loading skeleton**

Create `src/app/[locale]/(app)/transactions/page.tsx`:

```tsx
import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";

import { NewTransactionMenu } from "@/components/transactions/new-transaction-menu";
import { redirect } from "@/i18n/navigation";
import { auth } from "@/lib/auth";

export default async function TransactionsPage() {
  const locale = await getLocale();
  // Authoritative check. This queries Postgres; src/proxy.ts does not.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return redirect({ href: "/login", locale });

  const t = await getTranslations("transactions");

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>

        <NewTransactionMenu />
      </div>
    </main>
  );
}
```

Create `src/app/[locale]/(app)/transactions/loading.tsx`, mirroring that layout with `Skeleton` — a title bar, a filter bar, and eight table rows:

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-40" />
      </div>

      <Skeleton className="h-11 w-full" />

      <div className="rounded-md border">
        <Skeleton className="h-10 w-full rounded-b-none" />
        {Array.from({ length: 8 }, (_unused, index) => (
          <Skeleton key={index} className="h-12 w-full rounded-none border-t" />
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Run the tests, typecheck, and check the page renders**

Run: `npx vitest run src/components/transactions/ && npx tsc --noEmit && npm run lint`
Expected: PASS.

Then `npm run dev` and visit `http://localhost:3000/en-US/transactions`: the sidebar shows Transactions as active, the header renders, and the create menu opens with three items.

- [ ] **Step 7: Commit**

```bash
git add src/app "src/components/transactions" src/components/nav
git commit -m "feat(transactions): add the transactions route and create menu"
```

---

## Task 18: The list table, sorting, and pagination

**Files:**
- Create: `src/components/transactions/transaction-table.tsx`
- Create: `src/components/transactions/transaction-pagination.tsx`
- Create: `src/components/transactions/transaction-results.tsx`
- Modify: `src/app/[locale]/(app)/transactions/page.tsx`
- Test: `src/components/transactions/transaction-table.spec.tsx`

**Interfaces:**
- Consumes: `fetchTransactionList`, `TransactionListRow`; `formatDate`, `formatMoney`; `parseTransactionFilters`, `buildTransactionSearchParams`, `clampPage`, `PAGE_SIZE`; `resolveCategoryDisplay`.
- Produces:
  ```ts
  type TransactionTableProps = {
    rows: TransactionListRow[];
    categoryNames: Record<string, string>;
    cardNames: Record<string, string>;
    preferences: UserFormatPreferences;
    filters: TransactionFilters;
    /** Prebuilt hrefs keyed by column, so the table stays a pure renderer. */
    sortHrefs: Record<TransactionSort, string>;
    hasAnyTransactions: boolean;
    clearHref: string;
  };
  type TransactionPaginationProps = { page: number; total: number; hrefForPage: (page: number) => string };
  ```
  and the async server component `TransactionResults({ userId, filters, today })`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/transactions/transaction-table.spec.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";

import { renderWithIntl } from "@/test-utils/intl";
import { TransactionTable } from "@/components/transactions/transaction-table";
import { parseTransactionFilters } from "@/lib/validations/transaction-filters";
import type { TransactionListRow } from "@/lib/transactions/list-query";

const TODAY = new Date("2026-08-16T00:00:00.000Z");

const row = (overrides: Partial<TransactionListRow> = {}): TransactionListRow => ({
  kind: "single",
  id: "tx-1",
  planId: null,
  effectiveDate: "2026-08-14",
  startDate: null,
  description: "Groceries",
  type: "EXPENSE",
  amount: "120.50",
  isPaid: true,
  categoryId: "cat-1",
  cardId: "card-1",
  frequency: null,
  seriesIndex: null,
  seriesTotal: null,
  ...overrides,
});

const render = (rows: TransactionListRow[], overrides: Record<string, unknown> = {}) =>
  renderWithIntl(
    <TransactionTable
      rows={rows}
      categoryNames={{ "cat-1": "Food" }}
      cardNames={{ "card-1": "Personal Visa" }}
      preferences={{ currency: "USD", numberFormat: "COMMA_DOT", dateFormat: "MDY" }}
      filters={parseTransactionFilters({}, TODAY)}
      sortHrefs={{
        date: "/transactions?sort=date",
        amount: "/transactions?sort=amount",
        category: "/transactions?sort=category",
        description: "/transactions?sort=description",
      }}
      hasAnyTransactions
      clearHref="/transactions"
      {...overrides}
    />,
  );

describe("TransactionTable", () => {
  it("renders a one-off row with formatted date and amount", () => {
    render([row()]);

    expect(screen.getByText("08/14/2026")).toBeInTheDocument();
    expect(screen.getByText(/120\.50/)).toBeInTheDocument();
    expect(screen.getByText("Food")).toBeInTheDocument();
    expect(screen.getByText("Personal Visa")).toBeInTheDocument();
  });

  it("signs an expense negative and income positive", () => {
    render([row(), row({ id: "tx-2", type: "INCOME", cardId: null, amount: "5000.00" })]);

    expect(screen.getByText(/−.*120\.50/)).toBeInTheDocument();
    expect(screen.getByText(/\+.*5,000\.00/)).toBeInTheDocument();
  });

  // An ongoing recurrence shows both dates so its fallback start date is
  // never mistaken for a charge that happened.
  it("shows a recurring row's start date alongside its effective date", () => {
    render([
      row({
        kind: "recurring",
        id: "rec-1",
        effectiveDate: "2026-05-12",
        startDate: "2024-09-12",
        frequency: "MONTHLY",
        description: "Netflix",
      }),
    ]);

    expect(screen.getByText("05/12/2026")).toBeInTheDocument();
    expect(screen.getByText("Started 09/12/2024")).toBeInTheDocument();
    expect(screen.getByText("Monthly")).toBeInTheDocument();
  });

  it("badges an installment occurrence with its position in the series", () => {
    render([
      row({
        kind: "installment",
        id: "tx-9",
        planId: "plan-1",
        seriesIndex: 3,
        seriesTotal: 12,
        startDate: "2026-01-05",
      }),
    ]);

    expect(screen.getByText("3 of 12")).toBeInTheDocument();
  });

  it("links each sortable header, and marks the active column", () => {
    render([row()]);

    expect(screen.getByRole("link", { name: /Date/ })).toHaveAttribute(
      "href",
      "/en-US/transactions?sort=date",
    );
    expect(screen.getByRole("columnheader", { name: /Date/ })).toHaveAttribute(
      "aria-sort",
      "descending",
    );
    expect(screen.getByRole("columnheader", { name: /Amount/ })).toHaveAttribute(
      "aria-sort",
      "none",
    );
  });

  it("does not link the columns that cannot be sorted", () => {
    render([row()]);

    expect(
      within(screen.getByRole("columnheader", { name: "Card" })).queryByRole("link"),
    ).toBeNull();
  });

  // Two different empty states: nothing yet, versus nothing matching.
  it("invites a first transaction when the user has none", () => {
    render([], { hasAnyTransactions: false });

    expect(screen.getByText("You don't have any transactions yet.")).toBeInTheDocument();
  });

  it("offers to clear the filters when they are what emptied the list", () => {
    render([], { hasAnyTransactions: true });

    expect(screen.getByText("No transactions match these filters.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute(
      "href",
      "/en-US/transactions",
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/transactions/transaction-table.spec.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the table**

Create `src/components/transactions/transaction-table.tsx`:

```tsx
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { toUtcMidnight } from "@/lib/dates";
import { formatDate, formatMoney, type UserFormatPreferences } from "@/lib/format";
import type { TransactionListRow } from "@/lib/transactions/list-query";
import type { TransactionFilters, TransactionSort } from "@/lib/validations/transaction-filters";
import { TransactionRowActions } from "@/components/transactions/transaction-row-actions";
import { cn } from "@/lib/utils";

export type TransactionTableProps = {
  rows: TransactionListRow[];
  categoryNames: Record<string, string>;
  cardNames: Record<string, string>;
  preferences: UserFormatPreferences;
  filters: TransactionFilters;
  sortHrefs: Record<TransactionSort, string>;
  /** Distinguishes "no transactions yet" from "none match these filters". */
  hasAnyTransactions: boolean;
  clearHref: string;
};

const SORTABLE = ["date", "description", "category", "amount"] as const;

export function TransactionTable({
  rows,
  categoryNames,
  cardNames,
  preferences,
  filters,
  sortHrefs,
  hasAnyTransactions,
  clearHref,
}: TransactionTableProps) {
  const t = useTranslations("transactions");

  function sortIcon(column: TransactionSort) {
    if (filters.sort !== column) return <ArrowUpDown aria-hidden="true" />;
    return filters.dir === "asc" ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" />;
  }

  function ariaSort(column: TransactionSort) {
    if (filters.sort !== column) return "none" as const;
    return filters.dir === "asc" ? ("ascending" as const) : ("descending" as const);
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {SORTABLE.map((column) => (
              <TableHead
                key={column}
                aria-sort={ariaSort(column)}
                className={column === "amount" ? "text-right" : undefined}
              >
                <Link
                  href={sortHrefs[column]}
                  className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
                  aria-label={t("table.sortBy", { column: t(`table.${column}`) })}
                >
                  {t(`table.${column}`)}
                  {sortIcon(column)}
                </Link>
              </TableHead>
            ))}
            <TableHead>{t("table.card")}</TableHead>
            <TableHead>{t("table.type")}</TableHead>
            <TableHead>{t("table.paid")}</TableHead>
            <TableHead className="text-right">{t("table.actions")}</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="h-24 text-center whitespace-normal">
                <span className="flex flex-col items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {hasAnyTransactions ? t("table.emptyFiltered") : t("table.empty")}
                  </span>
                  <Link
                    href={hasAnyTransactions ? clearHref : "/transactions/new"}
                    className="text-sm font-medium underline underline-offset-4"
                  >
                    {hasAnyTransactions ? t("table.emptyFilteredCta") : t("table.emptyCta")}
                  </Link>
                </span>
              </TableCell>
            </TableRow>
          ) : (
            rows.map((entry) => (
              <TableRow key={`${entry.kind}-${entry.id}`}>
                <TableCell>
                  <span className="flex flex-col">
                    <span>{formatDate(toUtcMidnight(entry.effectiveDate), preferences.dateFormat)}</span>
                    {entry.kind === "recurring" && entry.startDate && (
                      <span className="text-xs text-muted-foreground">
                        {t("table.started", {
                          date: formatDate(toUtcMidnight(entry.startDate), preferences.dateFormat),
                        })}
                      </span>
                    )}
                  </span>
                </TableCell>

                <TableCell className="font-medium">
                  <span className="flex flex-wrap items-center gap-2">
                    {entry.description ?? t("table.none")}
                    {entry.kind === "recurring" && entry.frequency && (
                      <Badge variant="secondary">{t(`frequency.${entry.frequency}`)}</Badge>
                    )}
                    {entry.kind === "installment" && entry.seriesIndex && entry.seriesTotal && (
                      <Badge variant="secondary">
                        {t("table.series", { index: entry.seriesIndex, total: entry.seriesTotal })}
                      </Badge>
                    )}
                  </span>
                </TableCell>

                <TableCell className="text-muted-foreground">
                  {categoryNames[entry.categoryId] ?? t("table.none")}
                </TableCell>

                <TableCell
                  className={cn(
                    "text-right font-medium tabular-nums",
                    entry.type === "INCOME" && "text-success",
                  )}
                >
                  {entry.type === "INCOME" ? "+" : "−"}
                  {formatMoney(entry.amount, preferences)}
                </TableCell>

                <TableCell className="text-muted-foreground">
                  {entry.cardId ? (cardNames[entry.cardId] ?? t("table.none")) : t("table.none")}
                </TableCell>

                <TableCell className="text-muted-foreground">
                  {entry.type === "INCOME" ? t("table.typeIncome") : t("table.typeExpense")}
                </TableCell>

                <TableCell className="text-muted-foreground">
                  {entry.kind === "recurring"
                    ? t("table.none")
                    : entry.isPaid
                      ? t("table.paidYes")
                      : t("table.paidNo")}
                </TableCell>

                <TableCell className="text-right">
                  <TransactionRowActions row={entry} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
```

`TransactionRowActions` already exists — Task 20 runs before this task (see the execution-order note under Global Constraints), so import the finished component.

- [ ] **Step 4: Implement pagination**

Create `src/components/transactions/transaction-pagination.tsx` — a server component rendering the shadcn `Pagination` primitives as `Link`s. Show at most seven page links (first, last, and a window around the current page, with ellipses), plus previous/next. Every href comes from the `hrefForPage` callback so this component never builds a query string itself. Render nothing when `total <= PAGE_SIZE`.

- [ ] **Step 5: Wire the real data into the page**

Create `src/components/transactions/transaction-results.tsx` — an async Server Component that does the fetching, so the page can wrap it in `Suspense`:

```tsx
export async function TransactionResults({
  userId,
  filters,
  today,
}: {
  userId: string;
  filters: TransactionFilters;
  today: Date;
}) {
  const [user, categories, cards] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { currency: true, numberFormat: true, dateFormat: true },
    }),
    prisma.category.findMany({
      where: { userId, deactivatedAt: null },
      select: { id: true, name: true, description: true, systemLocaleKey: true },
    }),
    prisma.card.findMany({
      where: { userId, deactivatedAt: null },
      select: { id: true, name: true },
    }),
  ]);

  const tPresets = await getTranslations("categories.presets");

  // Resolved once and used twice: to render the category column, and — for
  // `sort=category` — as the join that lets Postgres order on the text the
  // user actually reads instead of a preset's English `name` column.
  const categoryNames = Object.fromEntries(
    categories.map((category) => [category.id, resolveCategoryDisplay(category, tPresets).name]),
  );

  const first = await fetchTransactionList({
    userId,
    filters,
    categorySortNames: new Map(Object.entries(categoryNames)),
  });

  // A `?page=` past the end is clamped rather than shown as an empty table.
  // The second fetch only happens on that out-of-range case.
  const page = clampPage(filters.page, first.total);
  const { rows, total } =
    page === filters.page
      ? first
      : await fetchTransactionList({
          userId,
          filters: { ...filters, page },
          categorySortNames: new Map(Object.entries(categoryNames)),
        });

  const hasAnyTransactions =
    total > 0 ||
    (await prisma.transaction.count({ where: { userId, deactivatedAt: null } })) > 0 ||
    (await prisma.recurringTransaction.count({ where: { userId, deactivatedAt: null } })) > 0;

  const hrefFor = (next: Partial<TransactionFilters>) => {
    const params = buildTransactionSearchParams({ ...filters, page, ...next }, today);
    const query = params.toString();
    return query ? `/transactions?${query}` : "/transactions";
  };

  const sortHrefs = Object.fromEntries(
    (["date", "amount", "category", "description"] as const).map((column) => [
      column,
      // Clicking the active column flips direction; a new column starts
      // descending, and either way pagination restarts at page 1.
      hrefFor({
        sort: column,
        dir: filters.sort === column && filters.dir === "desc" ? "asc" : "desc",
        page: 1,
      }),
    ]),
  ) as Record<TransactionSort, string>;

  return (
    <div className="flex flex-col gap-4">
      <TransactionTable
        rows={rows}
        categoryNames={categoryNames}
        cardNames={Object.fromEntries(cards.map((card) => [card.id, card.name]))}
        preferences={user}
        filters={{ ...filters, page }}
        sortHrefs={sortHrefs}
        hasAnyTransactions={hasAnyTransactions}
        clearHref="/transactions"
      />

      <TransactionPagination
        page={page}
        total={total}
        hrefForPage={(next) => hrefFor({ page: next })}
      />
    </div>
  );
}
```

Then in `page.tsx`, parse the filters and wrap the results in `Suspense`:

```tsx
export default async function TransactionsPage({
  searchParams,
}: PageProps<"/[locale]/transactions">) {
  const locale = await getLocale();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return redirect({ href: "/login", locale });

  // One `today` for the whole request, so parsing and href-building cannot
  // disagree about what the default period is.
  const today = new Date();
  const params = await searchParams;
  const filters = parseTransactionFilters(params, today);

  // …header…

  {/* Keyed on the params, so every filter, sort, or page change re-suspends
      and shows the skeleton instead of freezing the previous page. */}
  <Suspense key={JSON.stringify(params)} fallback={<TransactionTableSkeleton />}>
    <TransactionResults userId={session.user.id} filters={filters} today={today} />
  </Suspense>
}
```

Extract the eight skeleton rows from `loading.tsx` into a shared `TransactionTableSkeleton` so both use the same shape.

- [ ] **Step 6: Run the tests and check the page**

Run: `npx vitest run src/components/transactions/ && npx tsc --noEmit && npm run lint`
Expected: PASS.

With the dev server running, insert a few rows by hand (or via the forms once Task 21 lands) and confirm: dates and amounts formatted, income green with `+`, sort links flipping direction, and `?page=999` clamping to the last page rather than showing an empty table.

- [ ] **Step 7: Commit**

```bash
git add src/app src/components/transactions
git commit -m "feat(transactions): render the union list with sorting and pagination"
```

---

## Task 19: The filter panel

**Files:**
- Create: `src/components/transactions/transaction-filters.tsx`
- Modify: `src/app/[locale]/(app)/transactions/page.tsx`
- Test: `src/components/transactions/transaction-filters.spec.tsx`

**Interfaces:**
- Consumes: `AsyncCombobox`, `DatePicker`, `Collapsible`, `Select`, `Badge`; `buildTransactionSearchParams`, `countActiveFilters`, `TransactionFilters`; `useRouter` from `@/i18n/navigation`.
- Produces:
  ```ts
  type TransactionFiltersPanelProps = {
    filters: TransactionFilters;
    today: string;                         // ISO, so the client agrees with the server on "today"
    dateFormat: DateFormat;
    selectedCategory: ComboboxOption | null;
    selectedCard: ComboboxOption | null;
  };
  export function TransactionFiltersPanel(props: TransactionFiltersPanelProps): React.JSX.Element;
  ```

- [ ] **Step 1: Write the failing tests**

Create `src/components/transactions/transaction-filters.spec.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
vi.mock("@/i18n/navigation", async () => {
  const actual = await vi.importActual<typeof import("@/i18n/navigation")>("@/i18n/navigation");
  return { ...actual, useRouter: () => ({ push, replace: push, refresh: vi.fn() }) };
});

import { renderWithIntl } from "@/test-utils/intl";
import { TransactionFiltersPanel } from "@/components/transactions/transaction-filters";
import { parseTransactionFilters } from "@/lib/validations/transaction-filters";

const TODAY = new Date("2026-08-16T00:00:00.000Z");

const render = (params: Record<string, string> = {}) =>
  renderWithIntl(
    <TransactionFiltersPanel
      filters={parseTransactionFilters(params, TODAY)}
      today="2026-08-16"
      dateFormat="MDY"
      selectedCategory={null}
      selectedCard={null}
    />,
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response('{"items":[],"hasMore":false}'))));
});

describe("TransactionFiltersPanel", () => {
  it("starts collapsed", async () => {
    render();

    expect(screen.queryByLabelText("Show")).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: /Filters/ }));
    expect(screen.getByLabelText("Show")).toBeInTheDocument();
  });

  it("badges how many filters differ from the defaults", () => {
    render({ type: "INCOME", show: "single" });

    expect(screen.getByText("2 active")).toBeInTheDocument();
  });

  it("shows no badge when nothing is filtered", () => {
    render();

    expect(screen.queryByText(/active/)).not.toBeInTheDocument();
  });

  // Nothing refetches until Apply: picking a period would otherwise fire
  // three navigations while the user chooses two dates.
  it("does not navigate while controls change", async () => {
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole("button", { name: /Filters/ }));
    await user.selectOptions(screen.getByLabelText("Show"), "single");

    expect(push).not.toHaveBeenCalled();
  });

  it("navigates on Apply, and resets to page 1", async () => {
    const user = userEvent.setup();
    render({ page: "5" });

    await user.click(screen.getByRole("button", { name: /Filters/ }));
    await user.selectOptions(screen.getByLabelText("Show"), "recurring");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(push).toHaveBeenCalledWith("/transactions?show=recurring");
  });

  it("clears to the bare path", async () => {
    const user = userEvent.setup();
    render({ type: "INCOME", show: "single", page: "3" });

    await user.click(screen.getByRole("button", { name: /Filters/ }));
    await user.click(screen.getByRole("button", { name: "Clear" }));

    expect(push).toHaveBeenCalledWith("/transactions");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/transactions/transaction-filters.spec.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/components/transactions/transaction-filters.tsx` as a Client Component:

- Local `useState<TransactionFilters>` seeded from the `filters` prop, so every control edits draft state only.
- A `Collapsible` whose trigger is a `Button variant="outline"` showing `Filters`, a chevron, and — when `countActiveFilters(...) > 0` — a `Badge` with `t("filters.active", { count })`.
- Content: `className="grid grid-cols-12 gap-4 pt-4"` holding, each in its own `lg:col-span-3` cell with a `Label`:
  - Category — `AsyncCombobox` with `endpoint="/api/categories/options"`, `allOptionLabel={t("filters.any")}`, `selectedOption={selectedCategory}`.
  - Card — the same against `/api/cards/options`.
  - Type — `Select` with All / Income / Expense.
  - Show — `Select` with the four values.
  - From and To — `DatePicker`, `lg:col-span-3` each.
- A final `col-span-12 flex justify-end gap-2` row with **Clear** (`variant="ghost"`) and **Apply**.
- `Apply` → `router.push(hrefFrom({ ...draft, page: 1 }))`; `Clear` → reset the draft to `parseTransactionFilters({}, today)` and `router.push("/transactions")`.
- The href builder mirrors the server's exactly:

```ts
// `today` arrives as a string from the server so both sides agree on what the
// default period is — a client-side `new Date()` could be a day off across a
// timezone boundary and write out a period that is actually the default.
const href = (next: TransactionFilters) => {
  const query = buildTransactionSearchParams(next, toUtcMidnight(today)).toString();
  return query ? `/transactions?${query}` : "/transactions";
};
```

Then render it in `page.tsx` above the `Suspense` boundary, passing the user's `dateFormat` and the currently-filtered category/card as `selectedOption`s (looked up alongside the other page data).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/transactions/transaction-filters.spec.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 5: Check it in the browser**

Apply a filter, copy the URL, open it in a new tab: the same filtered view renders and the panel shows the same badge count. Reload; nothing resets.

- [ ] **Step 6: Commit**

```bash
git add src/components/transactions src/app
git commit -m "feat(transactions): add the collapsible filter panel"
```

---

## Task 20: Row actions

**Files:**
- Create: `src/components/transactions/transaction-row-actions.tsx`
- Test: `src/components/transactions/transaction-row-actions.spec.tsx`

**Execution order:** this task runs **before Task 18**, which imports the
component it produces. It depends only on `TransactionListRow` (Task 8) and
the delete actions (Tasks 14–15), not on the table.

**Interfaces:**
- Consumes: `deleteTransaction`, `deleteRecurringTransaction`; `TransactionListRow`.
- Produces: `TransactionRowActions({ row }: { row: TransactionListRow })`.

Edit and delete both depend on the row's kind:

| Kind | Edit target | Delete calls |
|---|---|---|
| `single` | `/transactions/{id}/edit` | `deleteTransaction(id)` |
| `recurring` | `/transactions/recurring/{id}/edit` | `deleteRecurringTransaction(id)` |
| `installment` | `/transactions/installments/{planId}/edit?occurrence={id}` | `deleteTransaction(id)` — one occurrence, not the plan |

- [ ] **Step 1: Write the failing tests**

Create `src/components/transactions/transaction-row-actions.spec.tsx`. Note the
edit-link locators use `getByRole("menuitem")`, **not** `"link"`:
`DropdownMenuLinkItem` wraps Base UI's `MenuPrimitive.LinkItem`, which renders a
real `<a>` (so it is openable in a new tab) but exposes it under the ARIA menu
pattern as `role="menuitem"`. The `href` assertions still prove the routing.

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/actions/transactions", () => ({ deleteTransaction: vi.fn() }));
vi.mock("@/lib/actions/recurring-transactions", () => ({ deleteRecurringTransaction: vi.fn() }));

import { deleteRecurringTransaction } from "@/lib/actions/recurring-transactions";
import { deleteTransaction } from "@/lib/actions/transactions";
import { renderWithIntl } from "@/test-utils/intl";
import { TransactionRowActions } from "@/components/transactions/transaction-row-actions";
import type { TransactionListRow } from "@/lib/transactions/list-query";

const row = (overrides: Partial<TransactionListRow> = {}): TransactionListRow => ({
  kind: "single",
  id: "tx-1",
  planId: null,
  effectiveDate: "2026-08-14",
  startDate: null,
  description: "Groceries",
  type: "EXPENSE",
  amount: "120.50",
  isPaid: false,
  categoryId: "cat-1",
  cardId: "card-1",
  frequency: null,
  seriesIndex: null,
  seriesTotal: null,
  ...overrides,
});

const openMenu = async (entry: TransactionListRow) => {
  const user = userEvent.setup();
  renderWithIntl(<TransactionRowActions row={entry} />);
  await user.click(screen.getByRole("button", { name: "Actions" }));
  return user;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(deleteTransaction).mockResolvedValue({ success: true });
  vi.mocked(deleteRecurringTransaction).mockResolvedValue({ success: true });
});

describe("TransactionRowActions", () => {
  it("edits a one-off on its own page", async () => {
    await openMenu(row());

    expect(await screen.findByRole("menuitem", { name: /Edit/ })).toHaveAttribute(
      "href",
      "/en-US/transactions/tx-1/edit",
    );
  });

  it("edits an ongoing recurrence on the recurring page", async () => {
    await openMenu(row({ kind: "recurring", id: "rec-1" }));

    expect(await screen.findByRole("menuitem", { name: /Edit/ })).toHaveAttribute(
      "href",
      "/en-US/transactions/recurring/rec-1/edit",
    );
  });

  // A generated occurrence has no page of its own: its Edit opens the plan,
  // pointed at that occurrence.
  it("edits an installment occurrence on its plan's page", async () => {
    await openMenu(row({ kind: "installment", id: "tx-9", planId: "plan-1" }));

    expect(await screen.findByRole("menuitem", { name: /Edit/ })).toHaveAttribute(
      "href",
      "/en-US/transactions/installments/plan-1/edit?occurrence=tx-9",
    );
  });

  it("deletes a one-off through the transaction action", async () => {
    const user = await openMenu(row());

    await user.click(await screen.findByRole("menuitem", { name: /Delete/ }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    expect(deleteTransaction).toHaveBeenCalledWith("tx-1", "en-US");
  });

  it("deletes a recurrence through the recurrence action", async () => {
    const user = await openMenu(row({ kind: "recurring", id: "rec-1" }));

    await user.click(await screen.findByRole("menuitem", { name: /Delete/ }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    expect(deleteRecurringTransaction).toHaveBeenCalledWith("rec-1", "en-US");
  });

  // Deleting one instalment must not take the plan with it.
  it("deletes only the occurrence for an installment row", async () => {
    const user = await openMenu(row({ kind: "installment", id: "tx-9", planId: "plan-1" }));

    await user.click(await screen.findByRole("menuitem", { name: /Delete/ }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    expect(deleteTransaction).toHaveBeenCalledWith("tx-9", "en-US");
    expect(deleteRecurringTransaction).not.toHaveBeenCalled();
  });

  it("shows the action's error and keeps the dialog open", async () => {
    vi.mocked(deleteTransaction).mockResolvedValue({ success: false, error: "Nope." });
    const user = await openMenu(row());

    await user.click(await screen.findByRole("menuitem", { name: /Delete/ }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Nope.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/transactions/transaction-row-actions.spec.tsx`
Expected: FAIL — the Task 18 stub renders nothing.

- [ ] **Step 3: Implement**

Replace the stub with a real component, following `src/components/cards/card-row-actions.tsx` exactly — the same `Tooltip`-wrapped `EllipsisVertical` trigger, the `variant="info"` `DropdownMenuLinkItem` for Edit and the `variant="destructive"` `DropdownMenuItem` for Delete, and the same fully-controlled `AlertDialog` (Base UI unmounts a menu item on click, so a nested `AlertDialogTrigger` would be gone before its dialog could open). What differs is only the branching:

```tsx
const editHref =
  row.kind === "recurring"
    ? `/transactions/recurring/${row.id}/edit`
    : row.kind === "installment"
      ? `/transactions/installments/${row.planId}/edit?occurrence=${row.id}`
      : `/transactions/${row.id}/edit`;

const dialogCopy =
  row.kind === "recurring"
    ? { title: t("deleteDialog.recurringTitle"), description: t("deleteDialog.recurringDescription") }
    : { title: t("deleteDialog.title"), description: t("deleteDialog.description") };

function handleConfirmDelete() {
  setError(null);
  startTransition(async () => {
    // An installment row deletes that occurrence only — the plan itself is
    // deleted from its own edit page, where the count is on screen.
    const result =
      row.kind === "recurring"
        ? await deleteRecurringTransaction(row.id, locale)
        : await deleteTransaction(row.id, locale);

    if (!result.success) {
      setError(result.error);
      return;
    }
    setDeleteOpen(false);
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/transactions/transaction-row-actions.spec.tsx`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/transactions/transaction-row-actions.tsx src/components/transactions/transaction-row-actions.spec.tsx
git commit -m "feat(transactions): add row actions for all three kinds"
```

---

## Task 21: One-off create and edit

**Files:**
- Create: `src/components/transactions/transaction-form.tsx`
- Create: `src/app/[locale]/(app)/transactions/new/{page,loading}.tsx`
- Create: `src/app/[locale]/(app)/transactions/[id]/edit/{page,loading}.tsx`
- Test: `src/components/transactions/transaction-form.spec.tsx`

**Interfaces:**
- Consumes: `createTransaction`, `updateTransaction`; `createTransactionSchema`, `TransactionValues`; `AsyncCombobox`, `DatePicker`, `Checkbox`, `RadioGroup`.
- Produces:
  ```ts
  type TransactionFormProps = {
    mode: "create" | "edit";
    transactionId?: string;
    defaultValues: TransactionValues;
    dateFormat: DateFormat;
    selectedCategory: ComboboxOption | null;
    selectedCard: ComboboxOption | null;
  };
  ```

- [ ] **Step 1: Read the form conventions**

Read `.claude/rules/ui.md`'s form section and `src/components/cards/card-form.tsx`. Note: a 12-column grid, `lg:h-11 lg:text-base` inputs, `Label required` on fields that are required *and start empty*, `useWatch` rather than `watch`, an explicit `defaultValue` on every `register()`-ed input, and `router.replace` on success.

- [ ] **Step 2: Write the failing tests**

Create `src/components/transactions/transaction-form.spec.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/actions/transactions", () => ({
  createTransaction: vi.fn(),
  updateTransaction: vi.fn(),
}));

const replace = vi.fn();
const refresh = vi.fn();
vi.mock("@/i18n/navigation", async () => {
  const actual = await vi.importActual<typeof import("@/i18n/navigation")>("@/i18n/navigation");
  return { ...actual, useRouter: () => ({ replace, refresh, push: vi.fn() }) };
});

import { createTransaction, updateTransaction } from "@/lib/actions/transactions";
import { renderWithIntl } from "@/test-utils/intl";
import { TransactionForm } from "@/components/transactions/transaction-form";
import type { TransactionValues } from "@/lib/validations/transaction";

const values: TransactionValues = {
  type: "EXPENSE",
  amount: "120.50",
  categoryId: "cat-1",
  cardId: "card-1",
  description: "Groceries",
  date: "2026-08-14",
  isPaid: false,
};

const render = (overrides: Record<string, unknown> = {}) =>
  renderWithIntl(
    <TransactionForm
      mode="create"
      defaultValues={values}
      dateFormat="MDY"
      selectedCategory={{ id: "cat-1", name: "Food" }}
      selectedCard={{ id: "card-1", name: "Personal Visa" }}
      {...overrides}
    />,
  );

const submit = (user: ReturnType<typeof userEvent.setup>, name = "Create transaction") =>
  user.click(screen.getByRole("button", { name }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createTransaction).mockResolvedValue({ success: true });
  vi.mocked(updateTransaction).mockResolvedValue({ success: true });
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response('{"items":[],"hasMore":false}'))));
});

describe("TransactionForm", () => {
  it("defaults a new transaction to Expense", () => {
    render({ defaultValues: { ...values, type: "EXPENSE" } });

    expect(screen.getByRole("radio", { name: "Expense" })).toBeChecked();
  });

  // The invariant from the schema, made visible: income has no card.
  it("hides the card field when Income is chosen", async () => {
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole("radio", { name: "Income" }));

    expect(screen.queryByLabelText("Card")).not.toBeInTheDocument();
  });

  it("clears a chosen card when switching to Income, so the payload stays valid", async () => {
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole("radio", { name: "Income" }));
    await submit(user);

    expect(vi.mocked(createTransaction).mock.calls[0][0].cardId).toBeNull();
  });

  it("shows the schema's message for an invalid amount without calling the action", async () => {
    const user = userEvent.setup();
    render();

    await user.clear(screen.getByRole("spinbutton", { name: /Amount/ }));
    await user.type(screen.getByRole("spinbutton", { name: /Amount/ }), "0");
    await submit(user);

    expect(await screen.findByText("Amount must be greater than zero.")).toBeInTheDocument();
    expect(createTransaction).not.toHaveBeenCalled();
  });

  // Money stays a string end to end; a float here is what a Decimal column exists to avoid.
  it("submits the amount as a string, never a number", async () => {
    const user = userEvent.setup();
    render();

    await submit(user);

    expect(vi.mocked(createTransaction).mock.calls[0][0].amount).toBe("120.50");
  });

  it("passes the active locale, which the action cannot resolve itself", async () => {
    const user = userEvent.setup();
    render();

    await submit(user);

    expect(vi.mocked(createTransaction).mock.calls[0][1]).toBe("en-US");
  });

  it("calls updateTransaction with the id in edit mode", async () => {
    const user = userEvent.setup();
    render({ mode: "edit", transactionId: "tx-1" });

    await submit(user, "Save changes");

    expect(vi.mocked(updateTransaction).mock.calls[0][0]).toBe("tx-1");
    expect(createTransaction).not.toHaveBeenCalled();
  });

  it("replaces rather than pushes on success, so Back does not return to the form", async () => {
    const user = userEvent.setup();
    render();

    await submit(user);

    expect(replace).toHaveBeenCalledWith("/transactions");
  });

  it("renders the action's error rather than navigating", async () => {
    vi.mocked(createTransaction).mockResolvedValue({ success: false, error: "Nope." });
    const user = userEvent.setup();
    render();

    await submit(user);

    expect(await screen.findByText("Nope.")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  // The edit page's first-paint concern: the label is on screen before any
  // request resolves.
  it("shows a preselected category without fetching", () => {
    render();

    expect(screen.getByLabelText(/Category/)).toHaveValue("Food");
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/components/transactions/transaction-form.spec.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the form**

Create `src/components/transactions/transaction-form.tsx`, modelled on `CardForm`, with this grid:

| Row | Fields |
|---|---|
| 1 | type `RadioGroup` `lg:col-span-4` · amount `Input type="number" step="0.01"` `lg:col-span-4` · date `DatePicker` `lg:col-span-4` |
| 2 | category `AsyncCombobox` `lg:col-span-6` · card `AsyncCombobox` `lg:col-span-6` (rendered only when type is `EXPENSE`) |
| 3 | description `Input` `lg:col-span-9` · paid `Checkbox` `lg:col-span-3` |
| 4 | submit `col-span-12 lg:w-auto lg:justify-self-end` |

Key details:

```tsx
const type = useWatch({ control, name: "type" });

// Switching to Income must clear the card, not just hide it: a hidden field
// still submits its value, and the schema rejects income carrying a card.
useEffect(() => {
  if (type === "INCOME") setValue("cardId", null, { shouldValidate: false });
}, [type, setValue]);
```

`amount`, `description` are `register()`-ed with explicit `defaultValue`; `type`, `date`, `categoryId`, `cardId`, `isPaid` are controlled through `useWatch` + `setValue` because their controls are not native inputs. `amount` and `category` get `Label required`; `type`, `date`, and `paid` do not — all three arrive pre-filled.

- [ ] **Step 5: Create the two pages and their skeletons**

`new/page.tsx` — session check, read the user's `dateFormat`, render a heading and `<TransactionForm mode="create" defaultValues={{ type: "EXPENSE", amount: "", categoryId: "", cardId: null, description: null, date: toIsoDate(new Date()), isPaid: false }} … />` with `selectedCategory`/`selectedCard` as `null`.

`[id]/edit/page.tsx` — typed as `PageProps<"/[locale]/transactions/[id]/edit">`; load the row scoped to the session user (`prisma.transaction.findFirst({ where: { id, userId } })`) and `notFound()` if it is missing; pass its values as `defaultValues`, and pass `selectedCategory`/`selectedCard` built from the joined rows so the comboboxes paint their labels immediately. A category's label comes from `resolveCategoryDisplay`, not the raw column.

Both `loading.tsx` files mirror their page: a heading skeleton and a three-row form skeleton.

- [ ] **Step 6: Verify**

Run: `npx vitest run src/components/transactions/ && npx tsc --noEmit && npm run lint`
Then create a transaction in the browser and confirm it appears in the list with the right sign, date, and category.

- [ ] **Step 7: Commit**

```bash
git add src/app src/components/transactions
git commit -m "feat(transactions): add one-off create and edit pages"
```

---

## Task 22: Ongoing recurrence create and edit

**Files:**
- Create: `src/components/transactions/recurring-transaction-form.tsx`
- Create: `src/app/[locale]/(app)/transactions/recurring/new/{page,loading}.tsx`
- Create: `src/app/[locale]/(app)/transactions/recurring/[id]/edit/{page,loading}.tsx`
- Test: `src/components/transactions/recurring-transaction-form.spec.tsx`

**Interfaces:**
- Consumes: `createRecurringTransaction`, `updateRecurringTransaction`; `createRecurringTransactionSchema`, `RecurringTransactionValues`; `RECURRING_FREQUENCIES`.
- Produces: `RecurringTransactionForm` with the same prop shape as `TransactionForm`, minus `isPaid` and with `defaultValues: RecurringTransactionValues`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/transactions/recurring-transaction-form.spec.tsx`. The mocks, the `render` helper, and the `submit` helper are the same as Task 21's, pointed at `@/lib/actions/recurring-transactions` and these values:

```tsx
const values: RecurringTransactionValues = {
  type: "EXPENSE",
  amount: "19.90",
  categoryId: "cat-1",
  cardId: "card-1",
  description: "Netflix",
  startDate: "2026-01-05",
  frequency: "MONTHLY",
};
```

```tsx
describe("RecurringTransactionForm", () => {
  it("offers all seven frequencies, labelled from the catalogue", async () => {
    const user = userEvent.setup();
    render();

    await user.click(screen.getByLabelText(/Repeats/));

    for (const label of [
      "Daily",
      "Weekly",
      "Every two weeks",
      "Monthly",
      "Quarterly",
      "Twice a year",
      "Yearly",
    ]) {
      expect(await screen.findByRole("option", { name: label })).toBeInTheDocument();
    }
  });

  // An ongoing recurrence has no end and generates nothing here, so neither
  // control belongs on this form.
  it("has no paid checkbox and no payment count", () => {
    render();

    expect(screen.queryByLabelText("Already paid")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Number of payments/)).not.toBeInTheDocument();
  });

  it("asks for a start date rather than a date", () => {
    render();

    expect(screen.getByLabelText(/Start date/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Date/)).not.toBeInTheDocument();
  });

  it("states that occurrences are not generated yet", () => {
    render();

    expect(
      screen.getByText(
        "This defines the recurrence. Its transactions aren't created yet — that arrives with automatic generation.",
      ),
    ).toBeInTheDocument();
  });

  it("hides and clears the card on Income", async () => {
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole("radio", { name: "Income" }));
    await submit(user);

    expect(screen.queryByLabelText("Card")).not.toBeInTheDocument();
    expect(vi.mocked(createRecurringTransaction).mock.calls[0][0].cardId).toBeNull();
  });

  it("shows the schema's message when the start date is out of range", async () => {
    const user = userEvent.setup();
    render({ defaultValues: { ...values, startDate: "1999-12-31" } });

    await submit(user);

    expect(
      await screen.findByText("Date must be between 2000-01-01 and 2100-12-31."),
    ).toBeInTheDocument();
    expect(createRecurringTransaction).not.toHaveBeenCalled();
  });

  it("passes the values and the active locale to the action", async () => {
    const user = userEvent.setup();
    render();

    await submit(user);

    expect(vi.mocked(createRecurringTransaction).mock.calls[0][0]).toMatchObject({
      frequency: "MONTHLY",
      startDate: "2026-01-05",
      amount: "19.90",
    });
    expect(vi.mocked(createRecurringTransaction).mock.calls[0][1]).toBe("en-US");
  });

  it("calls updateRecurringTransaction with the id in edit mode", async () => {
    const user = userEvent.setup();
    render({ mode: "edit", recurringTransactionId: "rec-1" });

    await submit(user, "Save changes");

    expect(vi.mocked(updateRecurringTransaction).mock.calls[0][0]).toBe("rec-1");
    expect(createRecurringTransaction).not.toHaveBeenCalled();
  });

  it("renders the action's error rather than navigating", async () => {
    vi.mocked(createRecurringTransaction).mockResolvedValue({ success: false, error: "Nope." });
    const user = userEvent.setup();
    render();

    await submit(user);

    expect(await screen.findByText("Nope.")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/transactions/recurring-transaction-form.spec.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`RecurringTransactionForm` is `TransactionForm`'s grid with two substitutions — start date in place of date, a frequency `Select` in place of the paid checkbox — and no `isPaid` field at all. Both pages render the form under a short note from `transactions.recurring.note`, so an empty transaction list is not read as a bug:

```tsx
<p className="col-span-12 text-sm text-muted-foreground">{t("recurring.note")}</p>
```

The edit page loads `prisma.recurringTransaction.findFirst({ where: { id, userId, fixedOccurrencesCount: false } })` — a plan id must 404 here rather than open the wrong editor.

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run src/components/transactions/ && npx tsc --noEmit && npm run lint`

```bash
git add src/app src/components/transactions
git commit -m "feat(transactions): add recurring create and edit pages"
```

---

## Task 23: Installment plan creation

**Files:**
- Create: `src/components/transactions/installment-form.tsx`
- Create: `src/app/[locale]/(app)/transactions/installments/new/{page,loading}.tsx`
- Test: `src/components/transactions/installment-form.spec.tsx`

**Interfaces:**
- Consumes: `createInstallmentPlan`; `createInstallmentSchema`, `InstallmentValues`; `occurrenceDates`, `MAX_INSTALLMENT_OCCURRENCES`; `formatDate`.
- Produces: `InstallmentForm({ defaultValues, dateFormat })` — creation only; the edit page is Task 24.

- [ ] **Step 1: Write the failing tests**

Create `src/components/transactions/installment-form.spec.tsx`:

```tsx
describe("InstallmentForm", () => {
  it("previews the span the plan will cover", async () => {
    const user = userEvent.setup();
    render();

    await user.clear(screen.getByRole("spinbutton", { name: /Number of payments/ }));
    await user.type(screen.getByRole("spinbutton", { name: /Number of payments/ }), "12");

    // Start date 2026-01-05, monthly: the preview is what tells the user
    // they are about to create rows into next December.
    expect(
      await screen.findByText("12 transactions, 01/05/2026 to 12/05/2026"),
    ).toBeInTheDocument();
  });

  it("re-computes the preview when the frequency changes", async () => {
    const user = userEvent.setup();
    render();

    await user.clear(screen.getByRole("spinbutton", { name: /Number of payments/ }));
    await user.type(screen.getByRole("spinbutton", { name: /Number of payments/ }), "3");
    await user.click(screen.getByLabelText(/Repeats/));
    await user.click(await screen.findByRole("option", { name: "Yearly" }));

    expect(
      await screen.findByText("3 transactions, 01/05/2026 to 01/05/2028"),
    ).toBeInTheDocument();
  });

  it("shows no preview until the count is valid", async () => {
    const user = userEvent.setup();
    render();

    await user.clear(screen.getByRole("spinbutton", { name: /Number of payments/ }));

    expect(screen.queryByText(/transactions,/)).not.toBeInTheDocument();
  });

  it("refuses a count over the maximum with the schema's message", async () => {
    const user = userEvent.setup();
    render();

    await user.clear(screen.getByRole("spinbutton", { name: /Number of payments/ }));
    await user.type(screen.getByRole("spinbutton", { name: /Number of payments/ }), "101");
    await user.click(screen.getByRole("button", { name: "Create transaction" }));

    expect(
      await screen.findByText("You can create at most 100 payments at once."),
    ).toBeInTheDocument();
    expect(createInstallmentPlan).not.toHaveBeenCalled();
  });

  it("submits the count as a number and the amount as a string", async () => {
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole("button", { name: "Create transaction" }));

    const payload = vi.mocked(createInstallmentPlan).mock.calls[0][0];
    expect(payload.occurrencesCount).toBe(12);
    expect(payload.amount).toBe("89.00");
  });

  it("hides and clears the card on Income", async () => {
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole("radio", { name: "Income" }));
    await user.click(screen.getByRole("button", { name: "Create transaction" }));

    expect(screen.queryByLabelText("Card")).not.toBeInTheDocument();
    expect(vi.mocked(createInstallmentPlan).mock.calls[0][0].cardId).toBeNull();
  });
});
```

The mocks and `render` helper match Task 21's, pointed at `@/lib/actions/installments`, with `defaultValues` of `{ type: "EXPENSE", amount: "89.00", categoryId: "cat-1", cardId: "card-1", description: "Gym", startDate: "2026-01-05", frequency: "MONTHLY", occurrencesCount: 12 }`.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/transactions/installment-form.spec.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`InstallmentForm` is `RecurringTransactionForm` plus an occurrence-count field (`Input type="number" min="1" max={MAX_INSTALLMENT_OCCURRENCES}`, `lg:col-span-3`) and the preview line, which reuses the same pure function the action generates from — so what the user is shown and what gets written cannot disagree:

```tsx
const startDate = useWatch({ control, name: "startDate" });
const frequency = useWatch({ control, name: "frequency" });
const count = Number(useWatch({ control, name: "occurrencesCount" }));

const preview = useMemo(() => {
  if (!startDate || !frequency) return null;
  if (!Number.isInteger(count) || count < 1 || count > MAX_INSTALLMENT_OCCURRENCES) return null;

  const dates = occurrenceDates(startDate, frequency, count);
  return t("installments.preview", {
    count,
    first: formatDate(dates[0], dateFormat),
    last: formatDate(dates[dates.length - 1], dateFormat),
  });
}, [startDate, frequency, count, dateFormat, t]);
```

Render it as a `col-span-12 text-sm text-muted-foreground` line above the submit button.

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run src/components/transactions/ && npx tsc --noEmit && npm run lint`

Then create a 12-payment plan in the browser and confirm twelve rows appear in the list, each badged `1 of 12` … `12 of 12`.

```bash
git add src/app src/components/transactions
git commit -m "feat(transactions): add installment plan creation"
```

---

## Task 24: Installment plan editing

**Files:**
- Create: `src/components/transactions/installment-series-form.tsx`
- Create: `src/components/transactions/installment-occurrences-table.tsx`
- Create: `src/app/[locale]/(app)/transactions/installments/[id]/edit/{page,loading}.tsx`
- Test: `src/components/transactions/installment-occurrences-table.spec.tsx`

**Interfaces:**
- Consumes: `updateInstallmentSeries`, `deleteInstallmentPlan`, `updateTransaction`, `deleteTransaction`; `createInstallmentSeriesSchema`.
- Produces:
  - `InstallmentSeriesForm({ planId, defaultValues, selectedCategory, selectedCard, occurrencesCount, frequency, startDate, dateFormat })`
  - `InstallmentOccurrencesTable({ planId, occurrences, seriesValues, dateFormat, focusOccurrenceId })` where `occurrences: { id: string; date: string; amount: string; description: string | null; isPaid: boolean }[]`

- [ ] **Step 1: Write the failing tests**

Create `src/components/transactions/installment-occurrences-table.spec.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/actions/transactions", () => ({
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
}));

import { deleteTransaction, updateTransaction } from "@/lib/actions/transactions";
import { renderWithIntl } from "@/test-utils/intl";
import { InstallmentOccurrencesTable } from "@/components/transactions/installment-occurrences-table";

const occurrences = [
  { id: "tx-1", date: "2026-01-05", amount: "89.00", description: "Gym", isPaid: true },
  { id: "tx-2", date: "2026-02-05", amount: "89.00", description: "Gym", isPaid: false },
  { id: "tx-3", date: "2026-03-05", amount: "89.00", description: "Gym", isPaid: false },
];

const seriesValues = { type: "EXPENSE" as const, categoryId: "cat-1", cardId: "card-1" };

const render = (overrides: Record<string, unknown> = {}) =>
  renderWithIntl(
    <InstallmentOccurrencesTable
      planId="plan-1"
      occurrences={occurrences}
      seriesValues={seriesValues}
      dateFormat="MDY"
      focusOccurrenceId={null}
      {...overrides}
    />,
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(updateTransaction).mockResolvedValue({ success: true });
  vi.mocked(deleteTransaction).mockResolvedValue({ success: true });
});

describe("InstallmentOccurrencesTable", () => {
  it("renders one editable row per occurrence, numbered", () => {
    render();

    // Three rows plus the header.
    expect(screen.getAllByRole("row")).toHaveLength(4);
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
    expect(screen.getByText("3 of 3")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Save" })).toHaveLength(3);
  });

  // Per-occurrence edits are the point of this table; one row's Save must
  // not carry another row's values.
  it("saves only the edited row's values", async () => {
    const user = userEvent.setup();
    render();

    const secondRow = screen.getAllByRole("row")[2];
    await user.clear(within(secondRow).getByRole("spinbutton"));
    await user.type(within(secondRow).getByRole("spinbutton"), "95.00");
    await user.click(within(secondRow).getByRole("button", { name: "Save" }));

    expect(updateTransaction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(updateTransaction).mock.calls[0][0]).toBe("tx-2");
    expect(vi.mocked(updateTransaction).mock.calls[0][1].amount).toBe("95.00");
  });

  // The occurrence carries the series' classification unchanged, so a
  // per-row save cannot silently reclassify it.
  it("submits the series' category, card, and type unchanged", async () => {
    const user = userEvent.setup();
    render();

    const firstRow = screen.getAllByRole("row")[1];
    await user.click(within(firstRow).getByRole("button", { name: "Save" }));

    expect(vi.mocked(updateTransaction).mock.calls[0][1]).toMatchObject({
      type: "EXPENSE",
      categoryId: "cat-1",
      cardId: "card-1",
    });
  });

  it("marks an occurrence paid", async () => {
    const user = userEvent.setup();
    render();

    const secondRow = screen.getAllByRole("row")[2];
    await user.click(within(secondRow).getByRole("checkbox"));
    await user.click(within(secondRow).getByRole("button", { name: "Save" }));

    expect(vi.mocked(updateTransaction).mock.calls[0][1].isPaid).toBe(true);
  });

  it("deletes a single occurrence without touching the others", async () => {
    const user = userEvent.setup();
    render();

    const secondRow = screen.getAllByRole("row")[2];
    await user.click(within(secondRow).getByRole("button", { name: "Delete payment" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    expect(deleteTransaction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(deleteTransaction).mock.calls[0][0]).toBe("tx-2");
  });

  // Per-row state, not one flag for the table: saving two rows in sequence
  // must not blank the first row's feedback.
  it("keeps each row's saved state separate", async () => {
    const user = userEvent.setup();
    render();

    const rows = screen.getAllByRole("row");
    await user.click(within(rows[1]).getByRole("button", { name: "Save" }));
    await screen.findByText("Saved");
    await user.click(within(rows[2]).getByRole("button", { name: "Save" }));

    expect(await screen.findAllByText("Saved")).toHaveLength(2);
  });

  it("focuses the occurrence named by the query param", () => {
    render({ focusOccurrenceId: "tx-3" });

    expect(screen.getAllByRole("spinbutton")[2]).toHaveFocus();
  });

  it("ignores an occurrence id that is not in this plan", () => {
    render({ focusOccurrenceId: "not-mine" });

    expect(document.body).toHaveFocus();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/transactions/installment-occurrences-table.spec.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the occurrences table**

Each row is its own small form: an index cell, a `DatePicker`, an amount `Input`, a description `Input`, a paid `Checkbox`, a Save button with its own pending state, and a delete button opening the shared confirm dialog. Save calls `updateTransaction(occurrence.id, { ...seriesValues, date, amount, description, isPaid }, locale)` — the series fields ride along unchanged so the row cannot be reclassified by accident, and the same schema validates it as any other transaction.

Track pending and error state **per row** (`Record<string, "idle" | "saving" | "saved">`), never one flag for the table: two rows saved in sequence must not blank each other's feedback.

- [ ] **Step 4: Implement the series form and the page**

`InstallmentSeriesForm` holds category, card, and type, submitting through `updateInstallmentSeries`, with `transactions.installments.seriesNote` above it stating that saving updates every payment. Frequency, start date, and payment count render as read-only text with `transactions.installments.frozenNote`, plus a "Delete plan" button opening an `AlertDialog` whose description interpolates the occurrence count and calls `deleteInstallmentPlan`.

The page (`PageProps<"/[locale]/transactions/installments/[id]/edit">`) loads the plan scoped to the session user **and** `fixedOccurrencesCount: true`, `notFound()`s otherwise, and loads its live occurrences ordered by date. Validate `?occurrence=` the same way every other input is validated — bounded by `TRANSACTION_ID_MAX_LENGTH` — and pass it through only when it names a row of this plan.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run src/components/transactions/ && npx tsc --noEmit && npm run lint`

In the browser: change the plan's category and confirm every occurrence in the list follows; change one occurrence's amount and confirm the others do not; delete the plan and confirm every one of its rows disappears from the list.

```bash
git add src/app src/components/transactions
git commit -m "feat(transactions): add installment plan editing"
```

---

## Task 25: End-to-end coverage

**Files:**
- Create: `e2e/transactions.spec.ts`
- Modify: `e2e/helpers.ts` (a `createCategory`/`createCard` helper pair, if the existing specs do not already export one)

**Interfaces:**
- Consumes: the whole feature.
- Produces: proof that the pieces work together against a real database and a real browser — the only place the raw SQL, the Suspense boundary, and the Server Actions are exercised as one.

- [ ] **Step 1: Write the suite**

Create `e2e/transactions.spec.ts`. Every test registers its own user (`registerUser`) so runs stay independent, then creates a category and a card to reference. Cover, one `test()` each:

1. **One-off round trip** — create an expense, see it in the list with the right date/category/amount, edit its amount, see the new value, delete it, see the empty state.
2. **Recurrence round trip** — create a monthly recurrence, see one row carrying its frequency badge and `Started …`, edit it, delete it.
3. **Installment plan** — create a 12-payment monthly plan; assert **12** rows appear, the first badged `1 of 12` and the last `12 of 12`; open the plan from an occurrence's Edit action and assert the URL carries `?occurrence=`.
4. **Series vs. occurrence edits** — change the plan's category and assert every row's category cell changed; change one occurrence's amount and assert exactly one row's amount changed.
5. **Plan deletion** — delete the plan, assert all 12 rows are gone.
6. **Generated rows of an ongoing recurrence stay hidden** — not reachable through the UI yet (nothing generates them), so insert one directly with `prisma` in the test, then assert the list shows the definition and not the generated row.
7. **Filters round-trip through the URL** — apply category + type + period, assert the URL, open that URL in a fresh page and assert the same rows; press Clear and assert the URL is back to `/en-US/transactions`.
8. **`show` distinguishes all four cases** — with a one-off, a recurrence, and a plan present, assert the row count for each of `all`, `single`, `recurring`, `installments`.
9. **Pagination** — create 51 transactions (via `prisma` directly, for speed), assert 50 rows on page 1, 1 on page 2, and that no id appears on both pages.
9b. **Pagination over an installment plan** — create a 60-occurrence plan and assert 50 rows on page 1, 10 on page 2, and that the pager reports two pages. The count query deliberately drops the `series` CTE join that the page query keeps (`withSeries` in `list-query.ts`), so this is the one user-visible path where `rows` and `total` could disagree; no other scenario exercises it end to end.
10. **Sorting** — click each sortable header and assert the first row changes as expected, and that the direction flips on a second click.
11. **A garbage query string renders page 1** — `?sort=drop%20table&page=-4&from=nonsense` returns 200 with the default view.
12. **Server-side enforcement** — sign in as one user, then submit a transaction referencing a *second* user's category id, and assert it is refused. Drive this through the form with the id swapped in, mirroring how `e2e/registration.spec.ts` tests the bypass rather than the form.

Use the accessible-name-aware locators the existing specs use: `getByRole("textbox", { name, exact: true })` for required fields, since `Label required` appends an `aria-hidden` asterisk that `getByLabel` still matches against.

- [ ] **Step 2: Run the whole e2e suite**

Run: `npm run test:e2e`
Expected: PASS — the new file plus every pre-existing spec.

- [ ] **Step 3: Run everything**

Run: `npm run lint && npx tsc --noEmit && npm test && npm run test:e2e`
Expected: all four pass. Do not claim the feature is done before seeing all four outputs.

- [ ] **Step 4: Commit**

```bash
git add e2e
git commit -m "test(transactions): add end-to-end coverage for all three kinds"
```

---

## Done

At this point the branch holds: the route move, one migration, six library modules, two endpoints, two UI primitives, twelve feature components, seven routes, and copy in three locales — with unit, component, and e2e coverage.

Before opening a pull request, re-read `.claude/rules/feature-development.md` and `.claude/rules/commit-guideline.md`, and confirm the `nextjs-agent-rules` block in `AGENTS.md` is either unchanged or committed deliberately (`next dev` rewrites it on every run).
