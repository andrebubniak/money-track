# Transactions Refinements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the thirteen requested refinements to the transactions feature, replacing the `isPaid` boolean with a nullable `paymentDate` and adding a masked money input, a date ceiling, and a reworked installment plan editor.

**Architecture:** One schema change (`Transaction.isPaid` becomes `Transaction.paymentDate`) that the form, list, and plan editor all build on; two new UI primitives (`MoneyInput`, a `maxDate` prop on `DatePicker`) plus the shadcn `Switch`; and a set of independent UI corrections to the list, the filter panel, and the selects. Tasks 1–3 are self-contained additions with no dependencies. Task 4 is the schema swap everything after it needs. Tasks 5–12 each touch one surface.

**Tech Stack:** Next.js (App Router, Server Actions), React 19 + react-hook-form, zod 4, Prisma 7 + PostgreSQL, next-intl, Tailwind 4, shadcn `base-vega` on Base UI, Vitest + Testing Library, Playwright.

**Design doc:** `docs/superpowers/specs/2026-08-19-transactions-refinements-design.md`

## Global Constraints

- **Read the rule files before touching their subject.** `.claude/rules/validation.md`, `.claude/rules/i18n.md`, `.claude/rules/ui.md`, `.claude/rules/database.md`, `.claude/rules/commit-guideline.md`.
- **Every user-visible string lives in `messages/<locale>.json`.** Never a literal in a component — including `aria-label`, `title`, and `sr-only` text. A key added to `messages/en-US.json` must be added to `messages/pt-BR.json` and `messages/de-DE.json` **in the same commit**; only `en-US` is typechecked, `src/i18n/messages.spec.ts` catches the other two.
- **Zod schemas are factories taking a translator**, defined in `src/lib/validations/`, imported by both the client and the server. Never validate on one side only.
- **Money is a string end to end.** `Decimal(12, 2)`, `MAX_TRANSACTION_AMOUNT = "9999999999.99"`. Never parse an amount to a `number` on the way to the database.
- **Dates cross every boundary as `YYYY-MM-DD` strings.** `Date` objects only inside `date-picker.tsx` and at the Prisma call (`toUtcMidnight`). Never `new Date()` on the client to decide what "today" is — the server passes it down.
- **Every Server Action takes `locale` as its last argument** and passes it to `getTranslations({ locale, namespace })`. `getLocale()` throws inside an action.
- **Icon sizing:** `size-6` for icons representing a thing the user is choosing; the `size-4` default everywhere else. Any new "every descendant svg" CSS rule must carry the `:not([class*='size-'])` guard.
- **Commit format:** `<type>(<subject>): <short description>`, kebab-case, imperative, no trailing period. End every commit message body with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- **Formatting:** `.prettierrc` (tabs, width 4, trailing commas) is now committed. `installment-form.tsx` and `recurring-transaction-form.tsx` are already formatted with it; other files are not. Do not reformat a file you are only editing part of.
- **Test commands:** `npm test -- <path>` runs Vitest once. `npm run lint` runs ESLint. `npm run test:e2e` runs Playwright.

---

### Task 1: Selects render their labels, not their raw values

`<SelectValue />` with no children renders the raw value string. Base UI's `resolveSelectedLabel` can only find a label through the Root's `items` prop, which none of these selects pass, so it falls through to `serializeValue`. That is why the frequency select shows `MONTHLY` and the filter's type select shows nothing at all for its `null` "All" entry. A function child takes precedence over that entire lookup.

**Files:**
- Modify: `src/components/transactions/transaction-filters.tsx` (the `filter-type` and `filter-show` selects)
- Modify: `src/components/transactions/recurring-transaction-form.tsx` (the `frequency` select)
- Modify: `src/components/transactions/installment-form.tsx` (the `frequency` select)
- Test: `src/components/transactions/transaction-filters.spec.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Write the failing tests**

Append to `src/components/transactions/transaction-filters.spec.tsx`, inside the existing top-level `describe`:

```tsx
it("shows the 'All' label in the type trigger when no type is filtered", () => {
  render();

  expect(screen.getByLabelText("Type")).toHaveTextContent("All");
});

it("shows the selected type's label, not its enum value", () => {
  render({ filters: { ...filters, type: "EXPENSE" } });

  expect(screen.getByLabelText("Type")).toHaveTextContent("Expense");
  expect(screen.getByLabelText("Type")).not.toHaveTextContent("EXPENSE");
});

it("shows the show filter's label, not its raw value", () => {
  render({ filters: { ...filters, show: "recurring" } });

  expect(screen.getByLabelText("Show")).toHaveTextContent("Recurring only");
  expect(screen.getByLabelText("Show")).not.toHaveTextContent("recurring only");
});
```

Read the top of that spec file first and reuse its existing `render` helper and `filters` fixture rather than inventing new ones. If `render` does not accept overrides, add a `(overrides = {}) => renderWithIntl(<TransactionFiltersPanel {...baseProps} {...overrides} />)` signature matching the pattern in `transaction-form.spec.tsx`.

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm test -- src/components/transactions/transaction-filters.spec.tsx`
Expected: FAIL — the type trigger is empty, and the show trigger reads `recurring`.

- [ ] **Step 3: Add a function child to each select**

In `transaction-filters.tsx`, the type select:

```tsx
<SelectTrigger id="filter-type" className="w-full lg:h-11 lg:text-base">
  {/* Base UI resolves a label only from the Root's `items` prop, which
      this select does not pass — without a function child it renders the
      raw value, and nothing at all for the `null` "All" entry. */}
  <SelectValue>
    {(type: TransactionType | null) =>
      type === null ? t("filters.any") : t(TYPE_LABEL_KEYS[type])
    }
  </SelectValue>
</SelectTrigger>
```

The show select:

```tsx
<SelectTrigger id="filter-show" className="w-full lg:h-11 lg:text-base">
  <SelectValue>
    {(show: TransactionShow) => t(SHOW_LABEL_KEYS[show])}
  </SelectValue>
</SelectTrigger>
```

In **both** `recurring-transaction-form.tsx` and `installment-form.tsx`, the frequency select — note these two files use tabs at width 4:

```tsx
<SelectValue>
	{(value: RecurringFrequency) => tFrequency(FREQUENCY_LABEL_KEYS[value])}
</SelectValue>
```

- [ ] **Step 4: Detach both frequency popups from their triggers**

In both form files, add `alignItemWithTrigger={false}` to the frequency `SelectContent`, so the popup opens below the trigger instead of overlaying it:

```tsx
<SelectContent alignItemWithTrigger={false}>
```

- [ ] **Step 5: Run the tests and lint**

Run: `npm test -- src/components/transactions/transaction-filters.spec.tsx && npm run lint`
Expected: PASS, no lint errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/transactions/transaction-filters.tsx src/components/transactions/recurring-transaction-form.tsx src/components/transactions/installment-form.tsx src/components/transactions/transaction-filters.spec.tsx
git commit -m "$(cat <<'EOF'
fix(transactions): render select labels instead of raw values

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `DatePicker` gains a `maxDate` prop

**Files:**
- Modify: `src/components/ui/date-picker.tsx`
- Test: `src/components/ui/date-picker.spec.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `DatePickerProps.maxDate?: string` — a `YYYY-MM-DD` string. Days after it are both unselectable and unreachable by month navigation. Consumed by Tasks 5, 6, 11.

- [ ] **Step 1: Write the failing test**

Append to `src/components/ui/date-picker.spec.tsx`. Read the file first and reuse its existing render helper:

```tsx
it("disables days after maxDate", async () => {
  const user = userEvent.setup();
  renderWithIntl(
    <DatePicker
      value="2026-08-10"
      onValueChange={vi.fn()}
      dateFormat="MDY"
      maxDate="2026-08-19"
    />,
  );

  await user.click(screen.getByRole("button", { name: "Choose a date" }));

  expect(screen.getByRole("button", { name: /19/ })).not.toBeDisabled();
  expect(screen.getByRole("button", { name: /20/ })).toBeDisabled();
});

it("does not disable any day when maxDate is omitted", async () => {
  const user = userEvent.setup();
  renderWithIntl(
    <DatePicker value="2026-08-10" onValueChange={vi.fn()} dateFormat="MDY" />,
  );

  await user.click(screen.getByRole("button", { name: "Choose a date" }));

  expect(screen.getByRole("button", { name: /20/ })).not.toBeDisabled();
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- src/components/ui/date-picker.spec.tsx`
Expected: FAIL — `maxDate` is not a prop, and day 20 is enabled.

- [ ] **Step 3: Implement `maxDate`**

Add to `DatePickerProps`:

```ts
/**
 * `YYYY-MM-DD`. Days after this are unselectable *and* unreachable: it
 * feeds both `disabled` and `endMonth`. `disabled` alone would leave the
 * user paging through empty future months; `endMonth` alone would not stop
 * a date already sitting in `value`.
 */
maxDate?: string;
```

Add `maxDate` to the destructured parameters, then compute the local-midnight bound beside the two that already exist, and pass both props to `Calendar`:

```tsx
// Read with correct local parts, for `Calendar` — same reason as
// `selectedForCalendar` above.
const maxForCalendar = maxDate ? toLocalMidnight(maxDate) : undefined;
```

```tsx
<Calendar
  mode="single"
  required
  selected={selectedForCalendar}
  defaultMonth={selectedForCalendar}
  disabled={maxForCalendar ? { after: maxForCalendar } : undefined}
  endMonth={maxForCalendar}
  onSelect={(next) => {
```

Leave `onSelect` and everything else unchanged.

- [ ] **Step 4: Run the tests**

Run: `npm test -- src/components/ui/date-picker.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/date-picker.tsx src/components/ui/date-picker.spec.tsx
git commit -m "$(cat <<'EOF'
feat(date-picker): add a maxDate ceiling

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `MoneyInput` — the masked currency field

A controlled field whose state is a digit string. The last two digits are always the decimals, so typing `12345` shows `123.45`. Non-digits — including `-` and `e` — are stripped on every keystroke, so a negative amount cannot be entered at all rather than being rejected after the fact.

**Files:**
- Create: `src/components/ui/money-input.tsx`
- Test: `src/components/ui/money-input.spec.tsx`

**Interfaces:**
- Consumes: `NumberFormat` from `@/generated/prisma/enums`; `Input` from `@/components/ui/input`.
- Produces, all consumed by Tasks 5, 6, 12:
  - `MAX_MONEY_DIGITS = 12`
  - `toDigits(value: string): string` — canonical `"1234.56"` to `"123456"`
  - `formatDigits(digits: string, numberFormat: NumberFormat): string` — `"123456"` to `"1,234.56"`
  - `toCanonical(digits: string): string` — `"123456"` to `"1234.56"`
  - `MoneyInput` — props `{ id?, value, onValueChange, numberFormat, placeholder?, invalid?, className?, ref?, "aria-label"?, "aria-describedby"? }`. `value` and the `onValueChange` argument are both the canonical `"1234.56"` string; `""` means empty.

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/money-input.spec.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  formatDigits,
  MoneyInput,
  toCanonical,
  toDigits,
} from "@/components/ui/money-input";

describe("money-input helpers", () => {
  it("converts a canonical amount to digits", () => {
    expect(toDigits("1234.56")).toBe("123456");
    expect(toDigits("0.05")).toBe("005");
    expect(toDigits("")).toBe("");
  });

  it("formats digits with the comma-dot convention", () => {
    expect(formatDigits("123456", "COMMA_DOT")).toBe("1,234.56");
    expect(formatDigits("5", "COMMA_DOT")).toBe("0.05");
    expect(formatDigits("", "COMMA_DOT")).toBe("");
  });

  it("formats digits with the dot-comma convention", () => {
    expect(formatDigits("123456", "DOT_COMMA")).toBe("1.234,56");
    expect(formatDigits("999999999999", "DOT_COMMA")).toBe("9.999.999.999,99");
  });

  it("converts digits back to a canonical amount", () => {
    expect(toCanonical("123456")).toBe("1234.56");
    expect(toCanonical("5")).toBe("0.05");
    expect(toCanonical("")).toBe("");
  });

  it("round-trips every canonical value it produces", () => {
    for (const digits of ["5", "005", "123456", "999999999999"]) {
      expect(toDigits(toCanonical(digits))).toBe(digits.replace(/^0+(?=\d{3})/, ""));
    }
  });
});

describe("MoneyInput", () => {
  const setup = (value = "") => {
    const onValueChange = vi.fn();
    render(
      <MoneyInput
        value={value}
        onValueChange={onValueChange}
        numberFormat="COMMA_DOT"
        aria-label="Value"
      />,
    );
    return { onValueChange, input: screen.getByLabelText("Value") };
  };

  it("masks the last two digits as the decimals", async () => {
    const user = userEvent.setup();
    const { onValueChange, input } = setup();

    await user.type(input, "12345");

    expect(onValueChange).toHaveBeenLastCalledWith("123.45");
  });

  it("displays the value with the user's number format", () => {
    render(
      <MoneyInput
        value="1234.56"
        onValueChange={vi.fn()}
        numberFormat="DOT_COMMA"
        aria-label="Value"
      />,
    );

    expect(screen.getByLabelText("Value")).toHaveValue("1.234,56");
  });

  it("never accepts a minus sign", async () => {
    const user = userEvent.setup();
    const { onValueChange, input } = setup();

    await user.type(input, "-50");

    expect(onValueChange).toHaveBeenLastCalledWith("0.50");
    expect(input).not.toHaveValue(expect.stringContaining("-"));
  });

  it("caps input at the Decimal(12,2) ceiling", async () => {
    const user = userEvent.setup();
    const { onValueChange, input } = setup();

    await user.type(input, "999999999999999");

    expect(onValueChange).toHaveBeenLastCalledWith("9999999999.99");
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- src/components/ui/money-input.spec.tsx`
Expected: FAIL — module `@/components/ui/money-input` does not exist.

- [ ] **Step 3: Implement `MoneyInput`**

Create `src/components/ui/money-input.tsx`:

```tsx
"use client";

import type * as React from "react";

import type { NumberFormat } from "@/generated/prisma/enums";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Twelve digits total — ten before the decimal point, two after — which is
 * exactly `MAX_TRANSACTION_AMOUNT` (`"9999999999.99"`) and exactly what a
 * `Decimal(12, 2)` column holds. See the design doc: the request named a
 * fourteen-digit ceiling, and the decision was to keep the column as it is.
 */
export const MAX_MONEY_DIGITS = 12;

/**
 * The separator conventions, not locales. Formatting follows the user's
 * stored `NumberFormat`, never the UI language — switching the interface to
 * Portuguese must not restyle someone's money. `src/lib/format.ts` makes the
 * same split for the read-only case.
 */
const SEPARATORS: Record<NumberFormat, { group: string; decimal: string }> = {
  COMMA_DOT: { group: ",", decimal: "." },
  DOT_COMMA: { group: ".", decimal: "," },
};

/**
 * Drops leading zeros only while at least three digits would remain, so
 * `"005"` (five cents) survives and `"00123"` collapses to `"123"`.
 */
function trimLeadingZeros(digits: string): string {
  return digits.replace(/^0+(?=\d{3})/, "");
}

/** Canonical `"1234.56"` to `"123456"`. `""` stays `""`. */
export function toDigits(value: string): string {
  if (!value) return "";
  const [whole = "", fraction = ""] = value.split(".");
  const cents = fraction.replace(/\D/g, "").padEnd(2, "0").slice(0, 2);
  return trimLeadingZeros(`${whole.replace(/\D/g, "")}${cents}`);
}

/** `"123456"` to `"1,234.56"` or `"1.234,56"`. `""` stays `""`. */
export function formatDigits(digits: string, numberFormat: NumberFormat): string {
  if (!digits) return "";
  const padded = digits.padStart(3, "0");
  const { group, decimal } = SEPARATORS[numberFormat];
  const whole = padded.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, group);
  return `${whole}${decimal}${padded.slice(-2)}`;
}

/** `"123456"` to the canonical `"1234.56"`. `""` stays `""`. */
export function toCanonical(digits: string): string {
  if (!digits) return "";
  const padded = digits.padStart(3, "0");
  return `${padded.slice(0, -2)}.${padded.slice(-2)}`;
}

export type MoneyInputProps = {
  id?: string;
  /** Canonical `"1234.56"`, or `""` for empty. */
  value: string;
  onValueChange: (value: string) => void;
  numberFormat: NumberFormat;
  placeholder?: string;
  invalid?: boolean;
  className?: string;
  /**
   * Plain prop, not `forwardRef` — React 19 passes `ref` through like any
   * other. The installment occurrences table needs one to focus the row
   * named by `?occurrence=`.
   */
  ref?: React.Ref<HTMLInputElement>;
  "aria-label"?: string;
  "aria-describedby"?: string;
};

/**
 * A controlled currency field. State is a digit string and the display is
 * derived from it, so there is no free-form `.` or trailing `0` for a
 * re-render to drop mid-edit — the hazard that made
 * `installment-occurrences-table.tsx` keep its amount input uncontrolled
 * does not apply here.
 *
 * `type="text"`, not `type="number"`: the latter permits `-`, `e`, and
 * arbitrary decimal places, and its spinner is meaningless for a masked
 * field. `inputMode="decimal"` still gets the numeric keypad on mobile.
 */
export function MoneyInput({
  value,
  onValueChange,
  numberFormat,
  invalid,
  className,
  ...props
}: MoneyInputProps) {
  return (
    <Input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={formatDigits(toDigits(value), numberFormat)}
      onChange={(event) => {
        const digits = event.target.value.replace(/\D/g, "").slice(0, MAX_MONEY_DIGITS);
        onValueChange(toCanonical(trimLeadingZeros(digits)));
      }}
      aria-invalid={invalid ? true : undefined}
      className={cn("lg:h-11 lg:text-base", className)}
      {...props}
    />
  );
}
```

- [ ] **Step 4: Run the tests and lint**

Run: `npm test -- src/components/ui/money-input.spec.tsx && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/money-input.tsx src/components/ui/money-input.spec.tsx
git commit -m "$(cat <<'EOF'
feat(ui): add a masked money input

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `paymentDate` replaces `isPaid`

The schema swap everything after this depends on. This task changes the column, the schemas, the actions, the list query, and every call site — but deliberately keeps the existing paid **checkbox** in the forms, bound to `paymentDate !== null`. Task 5 replaces that control. Splitting it this way is what keeps this task's build green and its tests runnable.

**Files:**
- Modify: `prisma/schema.prisma:139`
- Create: `prisma/migrations/<timestamp>_add_transaction_payment_date/migration.sql`
- Modify: `src/lib/validations/transaction.ts`
- Modify: `src/lib/validations/recurring-transaction.ts`, `src/lib/validations/installment.ts`
- Modify: `src/lib/actions/transactions.ts`, `src/lib/actions/installments.ts`
- Modify: `src/lib/transactions/list-query.ts:35,94,136,174`
- Modify: `src/app/[locale]/(app)/transactions/new/page.tsx`, `.../transactions/[id]/edit/page.tsx`, `.../transactions/installments/[id]/edit/page.tsx`
- Modify: `src/components/transactions/transaction-form.tsx`, `installment-occurrences-table.tsx`, `transaction-table.tsx`
- Modify: `messages/en-US.json`, `messages/pt-BR.json`, `messages/de-DE.json`
- Modify: `e2e/db.ts`
- Test: `src/lib/validations/transaction.spec.ts`, `src/lib/actions/transactions.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `Transaction.paymentDate: DateTime?` in Prisma.
  - `isoDateField(t, maxDate?: string)` — second parameter defaults to `MAX_TRANSACTION_DATE`.
  - `createTransactionSchema(t, options: { today: string; maxDate?: string })`.
  - `createRecurringTransactionSchema(t, today: string)`, `createInstallmentSchema(t, today: string)`.
  - `TransactionValues.paymentDate: string | null` replaces `isPaid: boolean`.
  - `TransactionListRow.paymentDate: string | null` replaces `isPaid: boolean`.
  - New `TransactionValidationKey` members: `date.notInFuture`, `date.beforePrevious`, `paymentDate.invalid`, `paymentDate.notInFuture`, `paymentDate.afterDate`.

- [ ] **Step 1: Write the failing schema tests**

Add to `src/lib/validations/transaction.spec.ts`. Read the file first — it uses a key-echoing translator stub, so assertions are on **keys**, not copy. Reuse whatever that stub is named:

```ts
const TODAY = "2026-08-19";
const options = { today: TODAY };

describe("createTransactionSchema — date ceiling", () => {
  it("accepts today", () => {
    const result = createTransactionSchema(t, options).safeParse({
      ...base,
      date: TODAY,
    });
    expect(result.success).toBe(true);
  });

  it("rejects tomorrow", () => {
    const result = createTransactionSchema(t, options).safeParse({
      ...base,
      date: "2026-08-20",
    });
    expect(issueKeys(result)).toContain("date.notInFuture");
  });

  it("accepts a later date when maxDate widens the ceiling", () => {
    const result = createTransactionSchema(t, {
      today: TODAY,
      maxDate: MAX_TRANSACTION_DATE,
    }).safeParse({ ...base, date: "2027-03-01" });
    expect(result.success).toBe(true);
  });
});

describe("createTransactionSchema — paymentDate", () => {
  it("accepts null as the unpaid state", () => {
    const result = createTransactionSchema(t, options).safeParse({
      ...base,
      date: "2026-08-10",
      paymentDate: null,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.paymentDate).toBeNull();
  });

  it("accepts a payment date equal to the transaction date", () => {
    const result = createTransactionSchema(t, options).safeParse({
      ...base,
      date: "2026-08-10",
      paymentDate: "2026-08-10",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a payment date after the transaction date", () => {
    const result = createTransactionSchema(t, options).safeParse({
      ...base,
      date: "2026-08-10",
      paymentDate: "2026-08-11",
    });
    expect(issueKeys(result)).toContain("paymentDate.afterDate");
  });

  it("rejects a payment date in the future even when the transaction is", () => {
    const result = createTransactionSchema(t, {
      today: TODAY,
      maxDate: MAX_TRANSACTION_DATE,
    }).safeParse({ ...base, date: "2027-03-01", paymentDate: "2026-08-20" });
    expect(issueKeys(result)).toContain("paymentDate.notInFuture");
  });

  it("does not add afterDate on top of an already-invalid payment date", () => {
    const result = createTransactionSchema(t, options).safeParse({
      ...base,
      date: "2026-08-10",
      paymentDate: "not-a-date",
    });
    expect(issueKeys(result)).not.toContain("paymentDate.afterDate");
  });
});
```

`base` is whatever valid-payload fixture the file already defines; add `paymentDate: null` to it. `issueKeys(result)` is `result.success ? [] : result.error.issues.map((i) => i.message)` — define it locally if the file has no equivalent.

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm test -- src/lib/validations/transaction.spec.ts`
Expected: FAIL — `createTransactionSchema` takes one argument, and `paymentDate` is not a field.

- [ ] **Step 3: Change the Prisma schema**

In `prisma/schema.prisma`, replace line 139:

```prisma
  isPaid      Boolean         @default(false) @map("is_paid")
```

with:

```prisma
  // Null means unpaid. When set, must be on or before `date` and never in
  // the future — neither is expressible in Prisma, so both rules live in
  // `createTransactionSchema` and are re-checked in the actions.
  paymentDate DateTime?       @map("payment_date")
```

- [ ] **Step 4: Write the migration by hand and apply it**

Create the migration directory with a timestamp matching the existing naming (`prisma/migrations/20260819120000_add_transaction_payment_date/migration.sql`):

```sql
-- Backfilled from `date`, not `now()`: that is what leaves every existing
-- paid row satisfying the new "payment date <= transaction date" rule, so
-- the migration cannot leave behind data the schema would reject.
ALTER TABLE "transactions" ADD COLUMN "payment_date" TIMESTAMP(3);

UPDATE "transactions" SET "payment_date" = "date" WHERE "is_paid" = true;

ALTER TABLE "transactions" DROP COLUMN "is_paid";
```

Run: `npx prisma migrate dev` (it will apply the file and regenerate the client) then `npx prisma generate`.
Expected: the migration applies, `src/generated/prisma/models/Transaction.ts` no longer mentions `isPaid`.

- [ ] **Step 5: Add the new message keys to all three catalogs**

`messages/en-US.json`, under `validation.transactions`:

```json
"date": {
  "invalid": "Enter a valid date.",
  "outOfRange": "Date must be between {min} and {max}.",
  "notInFuture": "Date can't be in the future.",
  "beforePrevious": "This payment can't be dated before the one before it."
},
"paymentDate": {
  "invalid": "Enter a valid payment date.",
  "notInFuture": "Payment date can't be in the future.",
  "afterDate": "Payment date can't be after the transaction date."
}
```

`messages/pt-BR.json`:

```json
"date": {
  "invalid": "Digite uma data válida.",
  "outOfRange": "A data deve estar entre {min} e {max}.",
  "notInFuture": "A data não pode ser futura.",
  "beforePrevious": "Este pagamento não pode ter data anterior à do pagamento anterior."
},
"paymentDate": {
  "invalid": "Digite uma data de pagamento válida.",
  "notInFuture": "A data de pagamento não pode ser futura.",
  "afterDate": "A data de pagamento não pode ser posterior à data da transação."
}
```

`messages/de-DE.json`:

```json
"date": {
  "invalid": "Bitte ein gültiges Datum eingeben.",
  "outOfRange": "Das Datum muss zwischen {min} und {max} liegen.",
  "notInFuture": "Das Datum darf nicht in der Zukunft liegen.",
  "beforePrevious": "Diese Zahlung darf nicht vor der vorherigen Zahlung datiert sein."
},
"paymentDate": {
  "invalid": "Bitte ein gültiges Zahlungsdatum eingeben.",
  "notInFuture": "Das Zahlungsdatum darf nicht in der Zukunft liegen.",
  "afterDate": "Das Zahlungsdatum darf nicht nach dem Transaktionsdatum liegen."
}
```

- [ ] **Step 6: Update the validation schemas**

In `src/lib/validations/transaction.ts`, extend the key union:

```ts
export type TransactionValidationKey =
  | "amount.invalid"
  | "amount.tooSmall"
  | "amount.tooLarge"
  | "category.required"
  | "card.invalid"
  | "card.notForIncome"
  | "description.tooLong"
  | "type.invalid"
  | "date.invalid"
  | "date.outOfRange"
  | "date.notInFuture"
  | "date.beforePrevious"
  | "paymentDate.invalid"
  | "paymentDate.notInFuture"
  | "paymentDate.afterDate"
  | "frequency.invalid"
  | "occurrences.invalid"
  | "occurrences.tooMany";
```

Give `isoDateField` a ceiling. Keep the existing regex, real-day, and range refinements exactly as they are and append a fourth. The `messageKey` parameter is what lets the payment-date field report its own messages rather than the transaction date's:

```ts
/**
 * `maxDate` narrows the upper bound below `MAX_TRANSACTION_DATE` — a
 * server-computed "today" for the fields that may not be in the future. The
 * message says *why* rather than restating the range.
 */
export function isoDateField(
  t: TransactionValidationTranslator,
  maxDate: string = MAX_TRANSACTION_DATE,
  messageKey: { invalid: TransactionValidationKey; notInFuture: TransactionValidationKey } = {
    invalid: "date.invalid",
    notInFuture: "date.notInFuture",
  },
) {
  return z
    .string()
    .trim()
    .regex(ISO_DATE_PATTERN, t(messageKey.invalid))
    .refine((value) => {
      const date = new Date(`${value}T00:00:00.000Z`);
      return !Number.isNaN(date.getTime()) && toIsoDate(date) === value;
    }, t(messageKey.invalid))
    .refine(
      (value) => value >= MIN_TRANSACTION_DATE && value <= MAX_TRANSACTION_DATE,
      t("date.outOfRange", { min: MIN_TRANSACTION_DATE, max: MAX_TRANSACTION_DATE }),
    )
    .refine((value) => value <= maxDate, t(messageKey.notInFuture));
}
```

Replace `createTransactionSchema`:

```ts
/**
 * `today` is always supplied by the server — a client-side `new Date()`
 * could sit a day either side of the server's across a timezone boundary
 * and disagree with the action about what "today" is.
 *
 * `maxDate` widens the ceiling back to `MAX_TRANSACTION_DATE` for an
 * installment plan's generated occurrences, which are legitimately
 * future-dated. `updateTransaction` picks it from the row itself.
 */
export function createTransactionSchema(
  t: TransactionValidationTranslator,
  options: { today: string; maxDate?: string },
) {
  return z
    .object({
      ...sharedTransactionFields(t),
      date: isoDateField(t, options.maxDate ?? options.today),
      paymentDate: isoDateField(t, options.today, {
        invalid: "paymentDate.invalid",
        notInFuture: "paymentDate.notInFuture",
      }).nullable(),
    })
    .superRefine(incomeHasNoCard(t))
    .superRefine(paymentDateNotAfterDate(t));
}
```

Add the guarded cross-field rule next to `incomeHasNoCard`:

```ts
/**
 * A payment cannot predate nothing and cannot postdate its transaction.
 * Guarded so a payload whose `date` or `paymentDate` already failed its own
 * check does not also collect this issue on the same path —
 * `.claude/rules/validation.md`. Both values are `YYYY-MM-DD`, for which
 * string comparison is a correct date comparison.
 */
export function paymentDateNotAfterDate(t: TransactionValidationTranslator) {
  return (values: { date: string; paymentDate: string | null }, ctx: z.RefinementCtx) => {
    if (values.paymentDate && values.date && values.paymentDate > values.date) {
      ctx.addIssue({
        code: "custom",
        message: t("paymentDate.afterDate"),
        path: ["paymentDate"],
      });
    }
  };
}
```

In `src/lib/validations/recurring-transaction.ts` and `src/lib/validations/installment.ts`, take `today` and pass it through:

```ts
export function createRecurringTransactionSchema(
  t: TransactionValidationTranslator,
  today: string,
) {
  return z
    .object({
      ...sharedTransactionFields(t),
      startDate: isoDateField(t, today),
      frequency: z.enum(RECURRING_FREQUENCIES, t("frequency.invalid")),
    })
    .superRefine(incomeHasNoCard(t));
}
```

Do the same for `createInstallmentSchema` (`startDate: isoDateField(t, today)`). `createInstallmentSeriesSchema` has no date field and is unchanged.

Update the stale comments in both files that say `date`/`isPaid` are absent — they should now say `date`/`paymentDate`.

- [ ] **Step 7: Update the actions**

In `src/lib/actions/transactions.ts`, replace `parseValues`:

```ts
async function parseValues(
  values: TransactionValues,
  locale: string,
  options: { today: string; maxDate?: string },
) {
  const t = await getTranslations({
    locale: resolveLocale(locale),
    namespace: "validation.transactions",
  });
  return createTransactionSchema(t, options).safeParse(values);
}
```

In `createTransaction`, a one-off is always capped at today:

```ts
const today = toIsoDate(new Date());
const parsed = await parseValues(values, locale, { today });
```

and write the column:

```ts
    date: toUtcMidnight(parsed.data.date),
    paymentDate: parsed.data.paymentDate ? toUtcMidnight(parsed.data.paymentDate) : null,
```

In `updateTransaction`, **move the row lookup above the parse** — the ceiling depends on the row:

```ts
export async function updateTransaction(
  id: string,
  values: TransactionValues,
  locale: string,
): Promise<ActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return notFoundError(locale);
  if (!transactionIdSchema.safeParse(id).success) return notFoundError(locale);

  // Looked up before parsing, not after: the date ceiling depends on what
  // kind of row this is. `deactivatedAt: null` excludes a soft-deleted row
  // — without it, a forged or replayed request could still write to a
  // transaction the user already deleted.
  const transaction = await prisma.transaction.findFirst({
    where: { id, userId, deactivatedAt: null },
  });
  if (!transaction) return notFoundError(locale);

  const today = toIsoDate(new Date());
  // A plan's occurrences are generated into the future by design, so
  // capping them at today would make every one of them unsavable from the
  // moment the plan is created. Their ordering is enforced below instead.
  const parsed = await parseValues(values, locale, {
    today,
    maxDate: transaction.recurringTransactionId ? MAX_TRANSACTION_DATE : undefined,
  });
  if (!parsed.success) return invalidInputError(locale);

  if (!(await ownsReferences(userId, parsed.data.categoryId, parsed.data.cardId))) {
    return invalidInputError(locale);
  }

  await prisma.transaction.update({
    where: { id },
    data: {
      categoryId: parsed.data.categoryId,
      cardId: parsed.data.cardId,
      type: parsed.data.type,
      amount: parsed.data.amount,
      description: parsed.data.description,
      date: toUtcMidnight(parsed.data.date),
      paymentDate: parsed.data.paymentDate ? toUtcMidnight(parsed.data.paymentDate) : null,
    },
  });

  revalidatePath("/[locale]/transactions", "page");
  return { success: true };
}
```

Import `MAX_TRANSACTION_DATE` and `toIsoDate`. The previous-sibling ordering rule is Task 12's; nothing about it belongs here yet.

In `src/lib/actions/installments.ts`, replace `isPaid: false` at line 93 with nothing at all: `paymentDate` defaults to `null`, so generated occurrences start unpaid without an explicit field. Update the comment at line 105 to say `paymentDate` instead of `isPaid`. Both `createRecurringTransaction` and `createInstallmentPlan` now need `today` passed into their schema factories — compute `const today = toIsoDate(new Date());` in each and thread it through, the same way `createTransaction` does.

- [ ] **Step 8: Update the list query**

In `src/lib/transactions/list-query.ts`, change the row type at line 35:

```ts
  /** `YYYY-MM-DD` when paid, null when not. Always null for a recurrence. */
  paymentDate: string | null;
```

and the three SQL projections:

```sql
           to_char(t.payment_date, 'YYYY-MM-DD') AS "paymentDate",
```

in `singleArm` (line 94) and `installmentArm` (line 136), and in `recurringArm` (line 174):

```sql
           NULL::text AS "paymentDate",
```

- [ ] **Step 9: Update every call site mechanically**

Keep the UI as it is; only rebind it. Task 5 replaces the control.

- `transactions/new/page.tsx`: `isPaid: false` becomes `paymentDate: null`. Add `today={toIsoDate(new Date())}` as a `TransactionForm` prop.
- `transactions/[id]/edit/page.tsx`: `isPaid: transaction.isPaid` becomes `paymentDate: transaction.paymentDate ? toIsoDate(transaction.paymentDate) : null`. Add the same `today` prop.
- `transactions/installments/[id]/edit/page.tsx`: `isPaid: occurrence.isPaid` becomes `paymentDate: occurrence.paymentDate ? toIsoDate(occurrence.paymentDate) : null`.
- `transaction-form.tsx`: add a `today: string` prop; pass `{ today }` to `createTransactionSchema`; the `isPaid` watch becomes `paymentDate`; the checkbox becomes `checked={paymentDate !== null}` with `onCheckedChange={(next) => setValue("paymentDate", next ? date : null, { shouldValidate: true })}`.
- `installment-occurrences-table.tsx`: `RowValues` becomes `{ date: string; paymentDate: string | null }`; `InstallmentOccurrence.isPaid` becomes `paymentDate: string | null`; `occurrenceDataEqual` compares `paymentDate`; the checkbox becomes `checked={row.paymentDate !== null}` / `onCheckedChange={(next) => updateRow(occurrence.id, { paymentDate: next === true ? row.date : null })}`. Pass `{ today }` to `createTransactionSchema` — thread a `today: string` prop down from the page, and pass `maxDate: MAX_TRANSACTION_DATE` since these are plan rows.
- `transaction-table.tsx`: the Paid cell becomes `entry.paymentDate ? t("table.paidYes") : t("table.paidNo")` for non-recurring rows. Task 7 rewrites this cell properly.
- `e2e/db.ts`: `isPaid?: boolean` becomes `paymentDate?: string | null`; the insert passes `input.paymentDate ?? null` and the SQL column list uses `payment_date`.

Update every spec fixture that sets `isPaid` to set `paymentDate` instead — the compiler and the failing tests will point at each one.

- [ ] **Step 10: Run the full suite**

Run: `npm test && npm run lint`
Expected: PASS. Every `isPaid` reference outside `src/generated/` is gone — verify with `grep -rn "isPaid" src/ e2e/ prisma/ --exclude-dir=generated`, which should print nothing.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(transactions): replace the paid flag with a payment date

Drops Transaction.isPaid for a nullable paymentDate, backfilled from each
row's own date so existing data satisfies the new "payment date on or
before the transaction date" rule. Adds a today ceiling to every data-entry
date field, widened back to MAX_TRANSACTION_DATE for an installment plan's
generated occurrences.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: The transaction form's switch and payment-date picker

**Files:**
- Create: `src/components/ui/switch.tsx` (via the shadcn CLI)
- Modify: `src/components/transactions/transaction-form.tsx`
- Modify: `src/app/[locale]/(app)/transactions/new/page.tsx`, `.../transactions/[id]/edit/page.tsx`
- Modify: `messages/en-US.json`, `messages/pt-BR.json`, `messages/de-DE.json`
- Test: `src/components/transactions/transaction-form.spec.tsx`

**Interfaces:**
- Consumes: `MoneyInput` (Task 3), `DatePicker.maxDate` (Task 2), `TransactionValues.paymentDate` and the `today` prop (Task 4).
- Produces: `TransactionFormProps.numberFormat: NumberFormat`.

- [ ] **Step 1: Add the shadcn Switch**

Run: `npx shadcn@latest add switch`

It writes `src/components/ui/switch.tsx` in the project's `base-vega` style. Read the generated file and confirm it carries no unguarded `[&_svg]:size-*` descendant selector; if it does, add the `:not([class*='size-'])` guard that `button.tsx` uses — `.claude/rules/ui.md` documents why an unguarded one silently beats a utility class.

- [ ] **Step 2: Add the copy to all three catalogs**

Under `transactions.form`, add `paymentDateLabel` and change `amountLabel`:

| Key | en-US | pt-BR | de-DE |
| --- | --- | --- | --- |
| `amountLabel` | `"Value"` | `"Valor"` (unchanged) | `"Betrag"` (unchanged) |
| `paymentDateLabel` | `"Payment date"` | `"Data de pagamento"` | `"Zahlungsdatum"` |

- [ ] **Step 3: Write the failing tests**

Add to `src/components/transactions/transaction-form.spec.tsx`. Update the shared `values` fixture to carry `paymentDate: null`, and the `render` helper to pass `today="2026-08-19"` and `numberFormat="COMMA_DOT"`:

```tsx
it("hides the payment date until the switch is on", () => {
  render();

  expect(screen.queryByLabelText("Payment date")).not.toBeInTheDocument();
});

it("reveals the payment date and seeds it from the transaction date", async () => {
  const user = userEvent.setup();
  render({ defaultValues: { ...values, date: "2026-08-14", paymentDate: null } });

  await user.click(screen.getByRole("switch", { name: "Already paid" }));

  expect(screen.getByLabelText("Payment date")).toHaveTextContent("08/14/2026");
});

it("clears the payment date when the switch goes off", async () => {
  const user = userEvent.setup();
  render({ defaultValues: { ...values, paymentDate: "2026-08-14" } });

  await user.click(screen.getByRole("switch", { name: "Already paid" }));
  await submit(user);

  expect(vi.mocked(createTransaction).mock.calls[0][0].paymentDate).toBeNull();
});

it("submits the value the money input masked", async () => {
  const user = userEvent.setup();
  render({ defaultValues: { ...values, amount: "" } });

  await user.type(screen.getByLabelText("Value"), "12345");
  await submit(user);

  expect(vi.mocked(createTransaction).mock.calls[0][0].amount).toBe("123.45");
});
```

- [ ] **Step 4: Run the tests and verify they fail**

Run: `npm test -- src/components/transactions/transaction-form.spec.tsx`
Expected: FAIL — there is no `switch` role, and the amount field is labelled "Amount".

- [ ] **Step 5: Swap in the new controls**

In `transaction-form.tsx`, add `numberFormat: NumberFormat` to the props and import `MoneyInput` and `Switch`. Replace the amount field:

```tsx
<div className="col-span-12 flex flex-col gap-2 lg:col-span-4">
  <Label htmlFor="amount" required>
    {t("amountLabel")}
  </Label>
  <MoneyInput
    id="amount"
    value={amount}
    onValueChange={(next) => setValue("amount", next, { shouldValidate: true })}
    numberFormat={numberFormat}
    placeholder={t("amountPlaceholder")}
    invalid={Boolean(errors.amount)}
    aria-describedby={errors.amount ? "amount-error" : undefined}
  />
  {errors.amount && (
    <p id="amount-error" className="text-sm text-destructive">
      {errors.amount.message}
    </p>
  )}
</div>
```

`amount` is now a `useWatch({ control, name: "amount" })` like the other non-native fields, and the `register("amount")` call and its `defaultValue` both go away — `MoneyInput` is controlled, so the value is in the server-rendered HTML already and the `.claude/rules/ui.md` `defaultValue` rule does not apply.

Narrow description from `lg:col-span-9` to `lg:col-span-6`, then replace the checkbox block:

```tsx
{/* Description is 6, this is 3, the picker below is 3 — the row totals
    12. At description's old span of 9 the picker would wrap onto a line
    of its own. */}
<div className="col-span-12 flex flex-col justify-center gap-2 lg:col-span-3">
  <div className="flex items-center gap-2 lg:h-11">
    <Switch
      id="paid"
      checked={paymentDate !== null}
      onCheckedChange={(next) =>
        setValue("paymentDate", next ? maxPaymentDate : null, { shouldValidate: true })
      }
    />
    <Label htmlFor="paid">{t("paidLabel")}</Label>
  </div>
</div>

{paymentDate !== null && (
  <div className="col-span-12 flex flex-col gap-2 lg:col-span-3">
    <Label htmlFor="paymentDate">{t("paymentDateLabel")}</Label>
    <DatePicker
      id="paymentDate"
      value={paymentDate}
      onValueChange={(next) => setValue("paymentDate", next, { shouldValidate: true })}
      dateFormat={dateFormat}
      maxDate={maxPaymentDate}
      triggerLabel={t("paymentDateLabel")}
      invalid={Boolean(errors.paymentDate)}
    />
    {errors.paymentDate && (
      <p className="text-sm text-destructive">{errors.paymentDate.message}</p>
    )}
  </div>
)}
```

with, beside the other `useWatch` calls:

```tsx
const amount = useWatch({ control, name: "amount" });
const paymentDate = useWatch({ control, name: "paymentDate" });

// A payment cannot postdate its transaction, and cannot be in the future.
// For a one-off `date` is itself capped at today, so this is normally just
// `date` — seeding the switch with it is always valid and never guesses a
// day the user did not choose.
const maxPaymentDate = date < today ? date : today;
```

Add `today: string` to the props if Task 4 did not already.

- [ ] **Step 6: Pass `numberFormat` from both pages**

In `new/page.tsx` and `[id]/edit/page.tsx`, extend the user select and the prop:

```tsx
select: { dateFormat: true, numberFormat: true },
```

```tsx
numberFormat={user.numberFormat}
```

- [ ] **Step 7: Run the tests and lint**

Run: `npm test -- src/components/transactions/transaction-form.spec.tsx && npm run lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
improve(transactions): switch and payment date on the transaction form

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Recurring and installment form layout

**Files:**
- Modify: `src/components/transactions/recurring-transaction-form.tsx`
- Modify: `src/components/transactions/installment-form.tsx`
- Modify: `src/app/[locale]/(app)/transactions/recurring/new/page.tsx`, `.../recurring/[id]/edit/page.tsx`, `.../installments/new/page.tsx`
- Test: `src/components/transactions/recurring-transaction-form.spec.tsx`, `installment-form.spec.tsx`

**Interfaces:**
- Consumes: `MoneyInput` (Task 3), `DatePicker.maxDate` (Task 2), the `today`-taking schema factories (Task 4).
- Produces: `numberFormat: NumberFormat` and `today: string` props on both forms.

Both files use **tabs at width 4**.

- [ ] **Step 1: Write the failing tests**

Add one test to each spec, adapting to that file's existing render helper:

```tsx
it("caps the start date at today", async () => {
  const user = userEvent.setup();
  render({ today: "2026-08-19" });

  await user.click(screen.getByRole("button", { name: "Start date" }));

  expect(screen.getByRole("button", { name: /20/ })).toBeDisabled();
});

it("labels the amount field Value", () => {
  render();

  expect(screen.getByLabelText("Value")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run and verify they fail**

Run: `npm test -- src/components/transactions/recurring-transaction-form.spec.tsx src/components/transactions/installment-form.spec.tsx`
Expected: FAIL.

- [ ] **Step 3: Apply the changes to `recurring-transaction-form.tsx`**

- Add `numberFormat: NumberFormat` and `today: string` props.
- Pass `today` into `createRecurringTransactionSchema(tValidation, today)`.
- Replace the amount `Input` with `MoneyInput`, exactly as Task 5 did for the transaction form (watch `amount`, drop `register`/`defaultValue`).
- Add `maxDate={today}` to the start-date `DatePicker`.
- Change the description wrapper from `lg:col-span-9` to `lg:col-span-6`, and the frequency wrapper from `lg:col-span-3` to `lg:col-span-6`.

- [ ] **Step 4: Apply the changes to `installment-form.tsx`**

Same five changes (`createInstallmentSchema(tValidation, today)` for the schema), plus the layout:

- Description wrapper: `lg:col-span-6` becomes `lg:col-span-12` — its own row.
- Frequency wrapper: `lg:col-span-3` becomes `lg:col-span-6`.
- Occurrences wrapper: `lg:col-span-3` becomes `lg:col-span-6`.

- [ ] **Step 5: Pass the new props from the three pages**

In each page, extend the user select to `select: { dateFormat: true, numberFormat: true }` and pass `numberFormat={user.numberFormat}` and `today={toIsoDate(new Date())}`.

- [ ] **Step 6: Run the tests and lint**

Run: `npm test && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
improve(transactions): widen the repeats select and cap start dates

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: The list's column order and payment-date column

**Files:**
- Modify: `src/components/transactions/transaction-table.tsx`
- Modify: `src/components/transactions/transaction-table-skeleton.tsx`
- Modify: `messages/en-US.json`, `messages/pt-BR.json`, `messages/de-DE.json`
- Test: `src/components/transactions/transaction-table.spec.tsx`

**Interfaces:**
- Consumes: `TransactionListRow.paymentDate` (Task 4).
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Update the catalogs**

Under `transactions.table`: rename `amount` to "Value" in en-US only (pt-BR already reads "Valor"; de-DE keeps "Betrag"). Replace `paid`/`paidYes`/`paidNo` with `paymentDate` and `notPaid`:

| Key | en-US | pt-BR | de-DE |
| --- | --- | --- | --- |
| `amount` | `"Value"` | `"Valor"` | `"Betrag"` |
| `paymentDate` | `"Payment date"` | `"Data de pagamento"` | `"Zahlungsdatum"` |
| `notPaid` | `"Not paid"` | `"Não pago"` | `"Nicht bezahlt"` |

Delete `paid`, `paidYes`, `paidNo` from all three.

- [ ] **Step 2: Write the failing tests**

In `transaction-table.spec.tsx`:

```tsx
it("orders the columns as Description, Value, Category, Card, Type, Date, Payment date, Actions", () => {
  render();

  expect(
    screen.getAllByRole("columnheader").map((cell) => cell.textContent?.trim()),
  ).toEqual([
    "Description",
    "Value",
    "Category",
    "Card",
    "Type",
    "Date",
    "Payment date",
    "Actions",
  ]);
});

it("shows a Not paid badge for an unpaid transaction", () => {
  render({ rows: [{ ...singleRow, paymentDate: null }] });

  expect(screen.getByText("Not paid")).toBeInTheDocument();
});

it("shows the payment date for a paid transaction", () => {
  render({ rows: [{ ...singleRow, paymentDate: "2026-08-14" }] });

  expect(screen.getByText("08/14/2026")).toBeInTheDocument();
  expect(screen.queryByText("Not paid")).not.toBeInTheDocument();
});

it("shows a dash for a recurrence, which has no payment", () => {
  render({ rows: [{ ...recurringRow, paymentDate: null }] });

  expect(screen.queryByText("Not paid")).not.toBeInTheDocument();
});
```

The header text includes the sort icon's accessible content for sortable columns; if `textContent` picks up extra whitespace, trim and collapse it rather than loosening the assertion.

- [ ] **Step 3: Run and verify they fail**

Run: `npm test -- src/components/transactions/transaction-table.spec.tsx`
Expected: FAIL — Date is first and there is no Payment date header.

- [ ] **Step 4: Render the header from an ordered descriptor list**

Replace the `SORTABLE` constant and the header block. The sortable columns are no longer contiguous, so mapping one array and then hardcoding the rest cannot express the order:

```tsx
/**
 * The rendered column order, and which of them sort. `sort=amount` stays
 * the URL value even though the column now reads "Value", so links already
 * in the wild keep working.
 */
const COLUMNS = [
  { key: "description", sortable: true },
  { key: "amount", sortable: true, align: "right" },
  { key: "category", sortable: true },
  { key: "card", sortable: false },
  { key: "type", sortable: false },
  { key: "date", sortable: true },
  { key: "paymentDate", sortable: false },
  { key: "actions", sortable: false, align: "right" },
] as const;
```

```tsx
<TableRow>
  {COLUMNS.map((column) => (
    <TableHead
      key={column.key}
      aria-sort={column.sortable ? ariaSort(column.key as TransactionSort) : undefined}
      className={"align" in column ? "text-right" : undefined}
    >
      {column.sortable ? (
        <Link
          href={sortHrefs[column.key as TransactionSort]}
          className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
          aria-label={t("table.sortBy", { column: t(`table.${column.key}`) })}
        >
          {t(`table.${column.key}`)}
          {sortIcon(column.key as TransactionSort)}
        </Link>
      ) : (
        t(`table.${column.key}`)
      )}
    </TableHead>
  ))}
</TableRow>
```

- [ ] **Step 5: Reorder the body cells and add the payment-date cell**

Move the existing cells into Description, Amount, Category, Card, Type, Date order — the JSX for each is unchanged, only its position — and replace the Paid cell with:

```tsx
<TableCell className="text-muted-foreground">
  {entry.kind === "recurring" ? (
    // A recurrence is a definition, not a payment.
    t("table.none")
  ) : entry.paymentDate ? (
    formatDate(toUtcMidnight(entry.paymentDate), preferences.dateFormat)
  ) : (
    // Secondary, not destructive: an unpaid expense is a state, not an
    // error, and a table of red badges reads as a page full of problems.
    <Badge variant="secondary">{t("table.notPaid")}</Badge>
  )}
</TableCell>
```

Keep `colSpan={8}` on the empty row — the count is unchanged.

- [ ] **Step 6: Match the skeleton**

`transaction-table-skeleton.tsx` mirrors the real layout (`.claude/rules/navigation-loading.md`: a skeleton that does not match is worse than a spinner). Reorder its placeholder cells to the same eight columns.

- [ ] **Step 7: Run the tests and lint**

Run: `npm test && npm run lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
improve(transactions): reorder the list and show payment dates

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: The empty state opens the type menu

**Files:**
- Modify: `src/components/transactions/new-transaction-menu.tsx`
- Modify: `src/components/transactions/transaction-table.tsx`
- Test: `src/components/transactions/new-transaction-menu.spec.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `NewTransactionMenu` props `{ variant?: "button" | "link"; label?: string }`, defaulting to `"button"` and `t("actions.new")`.

- [ ] **Step 1: Write the failing test**

```tsx
it("opens the same three choices from the link variant", async () => {
  const user = userEvent.setup();
  renderWithIntl(<NewTransactionMenu variant="link" label="New transaction" />);

  await user.click(screen.getByRole("button", { name: "New transaction" }));

  expect(screen.getByRole("menuitem", { name: /One-off transaction/ })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: /Recurring transaction/ })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: /Installments/ })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run and verify it fails**

Run: `npm test -- src/components/transactions/new-transaction-menu.spec.tsx`
Expected: FAIL — `NewTransactionMenu` takes no props.

- [ ] **Step 3: Add the variant and widen the content**

```tsx
export type NewTransactionMenuProps = {
  /**
   * `"link"` is the transactions list's empty state, where the control has
   * to read as the inline text link it replaces rather than as a second
   * primary button under the one already in the page header.
   */
  variant?: "button" | "link";
  label?: string;
};

export function NewTransactionMenu({ variant = "button", label }: NewTransactionMenuProps) {
  const t = useTranslations("transactions.actions");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          variant === "link" ? (
            <Button
              variant="link"
              className="h-auto p-0 text-sm font-medium underline underline-offset-4"
            />
          ) : (
            <Button />
          )
        }
      >
        {variant === "button" && <Plus data-icon="inline-start" aria-hidden="true" />}
        {label ?? t("new")}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-64 max-w-sm">
```

The three `DropdownMenuLinkItem`s are unchanged.

- [ ] **Step 4: Use it in the empty state**

In `transaction-table.tsx`, replace the empty-state branch's `Link`:

```tsx
{hasAnyTransactions ? (
  <Link
    href={clearHref}
    className="text-sm font-medium underline underline-offset-4"
  >
    {t("table.emptyFilteredCta")}
  </Link>
) : (
  // The same three choices the page header offers — this is a creation
  // entry point, and a bare link to /transactions/new would hide two of
  // them. "Clear filters" above is not, so it stays a plain link.
  <NewTransactionMenu variant="link" label={t("table.emptyCta")} />
)}
```

`TransactionTable` is a Server Component; importing this Client Component into it needs nothing special.

- [ ] **Step 5: Run the tests and lint**

Run: `npm test && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
improve(transactions): open the type menu from the empty state

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: The filter panel becomes a bordered container

**Files:**
- Modify: `src/components/transactions/transaction-filters.tsx`
- Test: `src/components/transactions/transaction-filters.spec.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Write the failing test**

```tsx
it("keeps the filters collapsed until the header bar is clicked", async () => {
  const user = userEvent.setup();
  render();

  expect(screen.queryByLabelText("Category")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /Filters/ }));

  expect(screen.getByLabelText("Category")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run it**

Run: `npm test -- src/components/transactions/transaction-filters.spec.tsx`
Expected: PASS already if the current trigger works — this test pins the behaviour so the restyle in Step 3 cannot break it. If it fails, fix the test's selector before continuing.

- [ ] **Step 3: Wrap the panel**

Replace the `Collapsible`/`CollapsibleTrigger` block:

```tsx
{/* The same `rounded-md border` container the table below uses, so the
    two read as one stack. The header bar is the trigger and carries the
    highlight: `bg-muted` is the token `.claude/rules/ui.md` records as
    deliberately tuned to read as a visible highlight against the page
    background — not a one-off shade. */}
<Collapsible className="overflow-hidden rounded-md border">
  {/* Still a `Button`, not a bare `<button>`: the chevron's
      `group-aria-expanded/button:rotate-180` depends on the `group/button`
      class `buttonVariants` supplies, and a plain element would silently
      drop the rotation. `rounded-none` and `h-auto` undo the parts of the
      ghost variant that fight a full-width header bar. */}
  <CollapsibleTrigger
    render={
      <Button
        variant="ghost"
        className="h-auto w-full justify-start gap-2 rounded-none bg-muted px-4 py-3 text-sm font-medium hover:bg-accent"
      />
    }
  >
    {t("filters.title")}
    {activeCount > 0 && <Badge>{t("filters.active", { count: activeCount })}</Badge>}
    <ChevronDown
      aria-hidden="true"
      className="ml-auto transition-transform group-aria-expanded/button:rotate-180"
    />
  </CollapsibleTrigger>

  <CollapsibleContent>
    <div className="grid grid-cols-12 gap-4 p-4">
```

Drop the old `pt-4` from that inner `div` — it is `p-4` now — and keep the closing tags balanced.

- [ ] **Step 4: Run the tests and lint**

Run: `npm test -- src/components/transactions/transaction-filters.spec.tsx && npm run lint`
Expected: PASS.

- [ ] **Step 5: Verify visually**

Run: `npm run dev`, open `/en-US/transactions`, and confirm the panel reads as a bordered card whose highlighted top bar toggles it, in both light and dark themes.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
improve(transactions): wrap the filters in a collapsible container

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Description moves to the installment series form

**Files:**
- Modify: `src/lib/validations/installment.ts`
- Modify: `src/lib/actions/installments.ts`
- Modify: `src/components/transactions/installment-series-form.tsx`
- Modify: `src/components/transactions/installment-occurrences-table.tsx`
- Modify: `src/app/[locale]/(app)/transactions/installments/[id]/edit/page.tsx`
- Modify: `messages/en-US.json`, `messages/pt-BR.json`, `messages/de-DE.json`
- Test: `src/lib/actions/installments.spec.ts`, `src/components/transactions/installment-occurrences-table.spec.tsx`

**Interfaces:**
- Consumes: `MoneyInput` (Task 3), `RowValues.paymentDate` (Task 4).
- Produces: `InstallmentSeriesValues.description: string | null`; `InstallmentOccurrencesTableProps.numberFormat: NumberFormat`; `RowValues` widened to `{ date: string; amount: string; paymentDate: string | null }`.

- [ ] **Step 1: Write the failing test**

In `src/lib/actions/installments.spec.ts`:

```ts
it("writes the description to the plan and every live occurrence", async () => {
  await updateInstallmentSeries("plan-1", { ...seriesValues, description: "Gym" }, "en-US");

  expect(prismaMock.recurringTransaction.update).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ description: "Gym" }) }),
  );
  expect(prismaMock.transaction.updateMany).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ description: "Gym" }) }),
  );
});
```

Match the file's existing mocking style rather than introducing `prismaMock` if it uses something else.

- [ ] **Step 2: Run and verify it fails**

Run: `npm test -- src/lib/actions/installments.spec.ts`
Expected: FAIL — `description` is not in `InstallmentSeriesValues`.

- [ ] **Step 3: Add `description` to the series schema**

In `src/lib/validations/installment.ts`, `createInstallmentSeriesSchema` gains the shared field rather than a redeclared one:

```ts
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
        .union([z.string().trim().max(TRANSACTION_ID_MAX_LENGTH, t("card.invalid")), z.null()])
        .optional()
        .transform((value) => (value ? value : null)),
      // A plan's payments describe the same thing, so description
      // classifies the series the way type/category/card do. Amount, date,
      // and payment date stay per-occurrence.
      description: sharedTransactionFields(t).description,
    })
    .superRefine(incomeHasNoCard(t));
}
```

Import `sharedTransactionFields` and update the doc comment above the function, which currently says description is deliberately absent.

- [ ] **Step 4: Write it in the action**

In `updateInstallmentSeries`, add `description: parsed.data.description` to the `seriesFields` object. Both the `recurringTransaction.update` and the `transaction.updateMany` already spread it.

- [ ] **Step 5: Add the field to the series form**

In `installment-series-form.tsx`, add a description `Input` following the same pattern the transaction form uses — `register("description")` with an explicit `defaultValue={defaultValues.description ?? ""}`, per `.claude/rules/ui.md`. Give it `lg:col-span-12` on its own row. Reuse `transactions.form.descriptionLabel` and `descriptionPlaceholder`; no new key is needed.

- [ ] **Step 6: Remove it from the occurrences table**

In `installment-occurrences-table.tsx`, delete the Description `TableHead`, the Description `TableCell`, the `descriptionRefs` ref object and every read of it, and the `description` field from `InstallmentOccurrence`. `handleSave` now takes description from `seriesValues` — which it already spreads first — so its `schema.safeParse({ ...seriesValues, ...row, amount })` call simply drops the `description` argument.

`occurrenceDataEqual` and the `useEffect` that resyncs uncontrolled inputs both stop comparing `description`; the effect keeps syncing `amount` only. Rename `syncedAmountsRef` comments accordingly if they mention description.

Delete `transactions.installments.occurrenceDescriptionLabel` from all three catalogs, and update `installments.seriesNote` to name description:

| Locale | `seriesNote` |
| --- | --- |
| en-US | `"Changing the description, category, card, or type updates every payment below."` |
| pt-BR | `"Alterar a descrição, categoria, cartão ou tipo atualiza todos os pagamentos abaixo."` |
| de-DE | `"Beschreibung, Kategorie, Karte oder Typ zu ändern aktualisiert jede Zahlung unten."` |

- [ ] **Step 7: Convert the occurrence amount to `MoneyInput`**

The last uncontrolled field in this table. Its `RowValues` comment explains why it was uncontrolled: a controlled `type="number"` fights the browser's mid-edit handling of a value like `"95.00"`, dropping the trailing `.` or `0` before the digits after it are typed. `MoneyInput` derives its display from a digit string, so there is no free-form `.` to lose — the reason no longer applies, and going controlled removes the whole ref-and-effect resync apparatus for this field.

Widen `RowValues` to `{ date: string; amount: string; paymentDate: string | null }`, seed and resync `amount` alongside the others in the render-time adjustment block, and replace the input:

```tsx
<TableCell>
  <MoneyInput
    value={row.amount}
    onValueChange={(next) => updateRow(occurrence.id, { amount: next })}
    numberFormat={numberFormat}
    aria-label={tInstallments("occurrenceAmountLabel", { index: occurrence.index })}
    className="w-36"
    ref={(element) => {
      amountRefs.current[occurrence.id] = element;
    }}
  />
</TableCell>
```

`amountRefs` stays — the `focusOccurrenceId` effect still focuses through it — but it is no longer a *source* of the value. `handleSave` reads `row.amount` instead of `amountRefs.current[id]?.value`.

With both uncontrolled fields gone, delete the `syncedAmountsRef` `useEffect` entirely and its `toServerSnapshot` seeding: the render-time state adjustment above it now covers every field, which is what that effect existed to compensate for. Update the long comment on `RowValues` to say so rather than leaving it describing an input that no longer exists.

Add a `numberFormat: NumberFormat` prop, passed from the edit page.

- [ ] **Step 8: Update the edit page**

Pass `description: plan.description` into the series form's `defaultValues`, drop `description: occurrence.description` from the occurrences mapping, extend the user select to `select: { dateFormat: true, numberFormat: true }`, and pass `numberFormat={user.numberFormat}` to the occurrences table.

- [ ] **Step 9: Run the tests and lint**

Run: `npm test && npm run lint`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
improve(installments): move description to the series form and mask amounts

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Mark as paid, as a row action

**Files:**
- Modify: `src/components/transactions/installment-occurrences-table.tsx`
- Modify: `messages/en-US.json`, `messages/pt-BR.json`, `messages/de-DE.json`
- Test: `src/components/transactions/installment-occurrences-table.spec.tsx`

**Interfaces:**
- Consumes: `DatePicker.maxDate` (Task 2), `RowValues.paymentDate` (Task 4).
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Add the copy**

Under `transactions.installments`:

| Key | en-US | pt-BR | de-DE |
| --- | --- | --- | --- |
| `markPaid` | `"Mark as paid"` | `"Marcar como pago"` | `"Als bezahlt markieren"` |
| `markPaidTitle` | `"When was this paid?"` | `"Quando isso foi pago?"` | `"Wann wurde das bezahlt?"` |
| `markPaidConfirm` | `"Mark as paid"` | `"Marcar como pago"` | `"Als bezahlt markieren"` |
| `markPaidClear` | `"Mark as unpaid"` | `"Marcar como não pago"` | `"Als unbezahlt markieren"` |
| `occurrencePaymentDateLabel` | `"Payment {index} payment date"` | `"Data de pagamento do pagamento {index}"` | `"Zahlungsdatum von Zahlung {index}"` |

Delete `occurrencePaidLabel` from all three.

- [ ] **Step 2: Write the failing tests**

```tsx
it("marks an occurrence paid from the row action", async () => {
  const user = userEvent.setup();
  render();

  await user.click(screen.getByRole("button", { name: "Payment 1 mark as paid" }));
  await user.click(screen.getByRole("button", { name: "Mark as paid" }));
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(vi.mocked(updateTransaction).mock.calls[0][1].paymentDate).toBe("2026-01-05");
});

it("caps the payment date at the occurrence's own date", async () => {
  const user = userEvent.setup();
  render();

  await user.click(screen.getByRole("button", { name: "Payment 1 mark as paid" }));
  await user.click(screen.getByLabelText("Payment 1 payment date"));

  expect(screen.getByRole("button", { name: /6/ })).toBeDisabled();
});

it("has no paid checkbox any more", () => {
  render();

  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
});
```

The first occurrence in this spec's fixture is dated `2026-01-05`; today in these tests is later than that, so the ceiling is the occurrence's own date. Adjust the day numbers if the fixture differs.

- [ ] **Step 3: Run and verify they fail**

Run: `npm test -- src/components/transactions/installment-occurrences-table.spec.tsx`
Expected: FAIL.

- [ ] **Step 4: Replace the Paid column with a Payment date cell**

Delete the Paid `TableHead` and its checkbox `TableCell`. Add a Payment date `TableHead` (`t("paymentDate")` from the `transactions.table` namespace this component already uses) and a cell:

```tsx
<TableCell className="text-muted-foreground">
  {row.paymentDate ? (
    formatDate(toUtcMidnight(row.paymentDate), dateFormat)
  ) : (
    <Badge variant="secondary">{t("notPaid")}</Badge>
  )}
</TableCell>
```

The table's columns are now index, Date, Value, Payment date, Actions.

- [ ] **Step 5: Add the action button and its dialog**

Beside the existing Save button and delete trigger, a third control — three separate controls, per the design decision, not an ellipsis menu:

```tsx
<Tooltip>
  <TooltipTrigger
    render={
      <Button
        type="button"
        variant="info"
        size="icon-sm"
        aria-label={tInstallments("markPaid") + " " + occurrence.index}
        onClick={() => setPaidTargetId(occurrence.id)}
      />
    }
  >
    <BadgeCheck aria-hidden="true" className="size-4" />
  </TooltipTrigger>
  <TooltipContent>{tInstallments("markPaid")}</TooltipContent>
</Tooltip>
```

Do **not** concatenate strings for the accessible name — that breaks `.claude/rules/i18n.md`. Add an indexed key instead and use it:

| Key | en-US | pt-BR | de-DE |
| --- | --- | --- | --- |
| `occurrenceMarkPaidLabel` | `"Payment {index} mark as paid"` | `"Marcar pagamento {index} como pago"` | `"Zahlung {index} als bezahlt markieren"` |

```tsx
aria-label={tInstallments("occurrenceMarkPaidLabel", { index: occurrence.index })}
```

One dialog shared across every row, targeted by `paidTargetId` — the same shape the delete dialog already uses, and for the same reason:

```tsx
const [paidTargetId, setPaidTargetId] = useState<string | null>(null);
const [paidDraft, setPaidDraft] = useState<string>("");

const paidTarget = visibleOccurrences.find((o) => o.id === paidTargetId) ?? null;
// A payment cannot postdate its own occurrence, and cannot be in the
// future. For an occurrence dated ahead of today this is today; for a past
// one it is the occurrence's own date.
const paidMax = paidTarget
  ? (values[paidTarget.id]?.date ?? paidTarget.date) < today
    ? (values[paidTarget.id]?.date ?? paidTarget.date)
    : today
  : today;
```

The dialog body is a single `DatePicker` with `value={paidDraft}`, `maxDate={paidMax}`, and `triggerLabel={tInstallments("occurrencePaymentDateLabel", { index: paidTarget.index })}`. Seed `paidDraft` to `paidMax` when the dialog opens. Confirming calls `updateRow(paidTargetId, { paymentDate: paidDraft })` and closes; a target that is already paid also offers a `markPaidClear` button calling `updateRow(paidTargetId, { paymentDate: null })`.

This only updates the row's draft state — the user still presses Save on that row to persist it, matching how date and amount already behave here.

Thread a `today: string` prop down from the edit page.

- [ ] **Step 6: Run the tests and lint**

Run: `npm test && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
improve(installments): mark a payment paid from a row action

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Occurrence dates stay in order

**Files:**
- Modify: `src/components/transactions/installment-occurrences-table.tsx`
- Modify: `src/lib/actions/transactions.ts`
- Modify: `messages/en-US.json`, `messages/pt-BR.json`, `messages/de-DE.json`
- Test: `src/components/transactions/installment-occurrences-table.spec.tsx`, `src/lib/actions/transactions.spec.ts`

**Interfaces:**
- Consumes: `ruleError` and the `date.beforePrevious` key (Task 4).
- Produces: nothing.

- [ ] **Step 1: Add the alert copy**

Under `transactions.installments`:

| Key | en-US | pt-BR | de-DE |
| --- | --- | --- | --- |
| `datesOutOfOrder` | `"Payments must stay in order — each one dated on or after the payment before it, and paid on or before its own date. Fix the highlighted rows to save."` | `"Os pagamentos devem permanecer em ordem — cada um com data igual ou posterior à do pagamento anterior, e pago na data dele ou antes. Corrija as linhas destacadas para salvar."` | `"Zahlungen müssen in der Reihenfolge bleiben — jede datiert auf oder nach der vorherigen Zahlung und bezahlt an ihrem Datum oder davor. Korrigieren Sie die markierten Zeilen, um zu speichern."` |

- [ ] **Step 2: Write the failing tests**

```tsx
it("flags a row dated before the one above it and blocks every save", async () => {
  const user = userEvent.setup();
  render();

  // Occurrence 2 is 2026-02-05; move it before occurrence 1's 2026-01-05.
  await setRowDate(user, 2, "2025-12-01");

  expect(screen.getByText(/Payments must stay in order/)).toBeInTheDocument();
  for (const save of screen.getAllByRole("button", { name: "Save" })) {
    expect(save).toBeDisabled();
  }
});

it("clears the block once the order is restored", async () => {
  const user = userEvent.setup();
  render();

  await setRowDate(user, 2, "2025-12-01");
  await setRowDate(user, 2, "2026-02-05");

  expect(screen.queryByText(/Payments must stay in order/)).not.toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "Save" })[0]).toBeEnabled();
});

it("flags a payment date later than its own occurrence date", async () => {
  const user = userEvent.setup();
  render({
    occurrences: occurrences.map((o) =>
      o.id === "tx-1" ? { ...o, paymentDate: "2026-01-06" } : o,
    ),
  });

  expect(screen.getByText(/Payments must stay in order/)).toBeInTheDocument();
});
```

Write `setRowDate(user, index, iso)` as a local helper that opens that row's date picker and clicks the day — mirror however the existing spec already drives `DatePicker`.

And in `src/lib/actions/transactions.spec.ts`:

```ts
it("rejects an occurrence dated before its previous sibling", async () => {
  // occurrence 2 of a plan whose occurrence 1 is dated 2026-02-01
  const result = await updateTransaction("tx-2", { ...values, date: "2026-01-01" }, "en-US");

  expect(result).toEqual({
    success: false,
    error: "This payment can't be dated before the one before it.",
  });
});
```

- [ ] **Step 3: Run and verify they fail**

Run: `npm test -- src/components/transactions/installment-occurrences-table.spec.tsx src/lib/actions/transactions.spec.ts`
Expected: FAIL.

- [ ] **Step 4: Derive the invalid rows during render**

Add above the component:

```ts
/**
 * Derived from the current draft values on every render, never stored: a
 * row is invalid when its date falls before the previous visible row's, or
 * when its payment date is later than its own date. Anchoring on the
 * immediately previous row — not the greatest date seen so far — is what
 * makes this agree exactly with the rule `updateTransaction` enforces.
 */
function invalidRowIds(
  rows: { id: string; date: string; paymentDate: string | null }[],
): Set<string> {
  const invalid = new Set<string>();
  let previous: string | null = null;

  for (const row of rows) {
    if (previous !== null && row.date < previous) invalid.add(row.id);
    if (row.paymentDate && row.paymentDate > row.date) invalid.add(row.id);
    previous = row.date;
  }

  return invalid;
}
```

Inside the component, after `visibleOccurrences`:

```tsx
const invalidIds = invalidRowIds(
  visibleOccurrences.map((occurrence) => ({
    id: occurrence.id,
    ...(values[occurrence.id] ?? {
      date: occurrence.date,
      paymentDate: occurrence.paymentDate,
    }),
  })),
);
```

- [ ] **Step 5: Render the alert and block saving**

Above the `<Table>`:

```tsx
{invalidIds.size > 0 && (
  <Alert variant="destructive" className="m-4 mb-0">
    <CircleAlert aria-hidden="true" />
    <AlertDescription>{tInstallments("datesOutOfOrder")}</AlertDescription>
  </Alert>
)}
```

On each row's `DatePicker`, add `invalid={invalidIds.has(occurrence.id)}`. On each row's Save button:

```tsx
// Every Save disables, not just the offending row's: a per-row block
// would let a user commit half a reshuffle and navigate away with the
// series still out of order.
disabled={rowStatus === "saving" || invalidIds.size > 0}
```

- [ ] **Step 6: Enforce the previous-sibling rule server-side**

In `src/lib/actions/transactions.ts`, add a helper beside `parseValues`. Unlike `invalidInputError` it names the rule that failed — safe to surface, because the client enforces the same rule and the message reveals nothing about rows the user cannot already see:

```ts
async function ruleError(
  key: "date.beforePrevious",
  locale: string,
): Promise<ActionResult> {
  const t = await getTranslations({
    locale: resolveLocale(locale),
    namespace: "validation.transactions",
  });
  return { success: false, error: t(key) };
}
```

Then in `updateTransaction`, after the parse and the ownership check, before the write:

```ts
// A plan's occurrences must stay in order. Only the "not before the
// previous one" half is enforced: saving is per row, so also requiring
// "not after the next one" would deadlock a legitimate reshuffle —
// moving [Jan, Feb, Mar] to [Jan, Apr, May] has no valid one-row-at-a-time
// path. The client blocks the broken intermediate state from being
// reached; a forged request can only break the chain in the direction that
// has to stay open anyway.
if (transaction.recurringTransactionId) {
  const previous = await prisma.transaction.findFirst({
    where: {
      recurringTransactionId: transaction.recurringTransactionId,
      deactivatedAt: null,
      id: { not: id },
      OR: [
        { date: { lt: transaction.date } },
        { date: transaction.date, createdAt: { lt: transaction.createdAt } },
      ],
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    select: { date: true },
  });

  if (previous && toUtcMidnight(parsed.data.date) < previous.date) {
    return ruleError("date.beforePrevious", locale);
  }
}
```

The `createdAt` tie-break matters: a plan generated on a daily frequency can hold several occurrences on the same date, and `date` alone would not give a stable predecessor.

- [ ] **Step 7: Run the tests and lint**

Run: `npm test && npm run lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(installments): keep occurrence dates in order

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: End-to-end coverage

**Files:**
- Modify: `e2e/transactions.spec.ts`
- Test: the same file

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: Update the existing specs**

Read `e2e/transactions.spec.ts` and fix every assertion the reordered columns and renamed copy broke — "Amount" becomes "Value", the Paid column becomes Payment date. A required field's label carries an asterisk, so query it with `getByRole("textbox", { name, exact: true })`, never `getByLabel(..., { exact: true })` — `.claude/rules/ui.md` explains why.

- [ ] **Step 2: Add the future-date coverage**

```ts
test("cannot pick a future date for a one-off transaction", async ({ page }) => {
  await page.goto(path("/transactions/new"));
  await page.getByRole("button", { name: "Date" }).click();

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  await expect(
    page.getByRole("button", { name: String(tomorrow.getDate()), exact: true }),
  ).toBeDisabled();
});
```

- [ ] **Step 3: Add the bypass coverage**

`.claude/rules/validation.md` requires testing the server rule directly, not only through the form — a rule only the form exercises is untested. Read `e2e/registration.spec.ts` first: it posts straight at the endpoint with a payload the browser would have rejected and asserts the status and error code. Mirror that shape here, driving `createTransaction` from a page context so the session cookie rides along:

```ts
test("rejects a future date posted past the form", async ({ page }) => {
  await page.goto(path("/transactions/new"));

  const before = await countTransactions(userId);

  const result = await page.evaluate(async () => {
    const { createTransaction } = await import("/_next/static/chunks/actions.js");
    return createTransaction(
      {
        type: "EXPENSE",
        amount: "10.00",
        categoryId: window.__categoryId,
        cardId: null,
        description: null,
        date: "2099-01-01",
        paymentDate: null,
      },
      "en-US",
    );
  });

  expect(result.success).toBe(false);
  expect(await countTransactions(userId)).toBe(before);
});
```

A Server Action is not importable from a browser chunk that way. If the `page.evaluate` import does not resolve, fall back to the shape that definitely works: submit the form with a valid date, then `page.request.post` the action endpoint using the `next-action` request id captured from the network trace of that submission, replaying it with `date: "2099-01-01"`. Either way the two assertions are the same — `success: false`, and the row count unchanged.

Repeat for a payload whose `paymentDate` is one day after its `date`, and for one whose `date` is valid but `paymentDate` is `"2099-01-01"`.

`countTransactions` is a helper to add to `e2e/db.ts` alongside the existing insert helper:

```ts
/** Live rows only — a soft-deleted row is not a row the user can see. */
export async function countTransactions(userId: string): Promise<number> {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS count FROM transactions
      WHERE user_id = $1 AND deactivated_at IS NULL`,
    [userId],
  );
  return rows[0].count;
}
```

Match `e2e/db.ts`'s existing query helper name and signature rather than assuming `query`.

- [ ] **Step 4: Run the e2e suite**

Run: `npm run test:e2e`
Expected: PASS.

- [ ] **Step 5: Run everything one last time**

Run: `npm test && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
test(transactions): cover payment dates and the date ceiling

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
