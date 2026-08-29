# Transactions Refinements — Design

**Date:** 2026-08-19
**Branch:** `claude/transactions`
**Status:** Approved, ready for an implementation plan

A second pass over the transactions feature. Thirteen changes requested after
using the shipped feature, plus the plan-editor rework that came out of
question 4 during brainstorming. They divide into one schema change that
everything else leans on (`isPaid` becomes `paymentDate`), a new input
primitive (the masked money field), and a set of independent UI corrections.

## 1. Data model

`Transaction.isPaid` is dropped in favour of a nullable payment date. A
boolean cannot answer "when was this paid", and the two facts are never
independent — a paid transaction always has a date, an unpaid one never does.

```prisma
// Null means unpaid. When set, must be on or before `date`, and never in
// the future. Neither rule is expressible in Prisma, so both live in the
// schema factory and are re-checked in the actions —
// `.claude/rules/database.md`'s "non-obvious invariants get a comment".
paymentDate DateTime? @map("payment_date")
```

**Migration `add_transaction_payment_date`**, in this order:

1. `ALTER TABLE transactions ADD COLUMN payment_date TIMESTAMP(3);`
2. `UPDATE transactions SET payment_date = date WHERE is_paid = true;`
3. `ALTER TABLE transactions DROP COLUMN is_paid;`

Backfilling from `date` — rather than `now()` — is what keeps every existing
row satisfying the new "payment date ≤ transaction date" rule, so the
migration cannot leave behind data the schema would reject.

### Money columns are not widened

The request named a ceiling of `999999999999.99`, which is twelve digits
*before* the decimal point and would require `Decimal(14, 2)`. The decision
was to keep `Decimal(12, 2)`, so `MAX_TRANSACTION_AMOUNT` stays
`"9999999999.99"` and "at most 12 digits" is read as twelve digits in total:
ten before the point, two after. The mask in §3 enforces exactly that.

`RecurringTransaction.amount` and `ExpensePlanItem.plannedAmount` are
untouched, and every money column keeps the same ceiling.

## 2. Validation

All rules live in `src/lib/validations/transaction.ts` and are shared by the
client and the actions, per `.claude/rules/validation.md`.

### `isoDateField` gains a ceiling

```ts
export function isoDateField(
  t: TransactionValidationTranslator,
  maxDate: string = MAX_TRANSACTION_DATE,
)
```

The existing regex, real-day, and 2000–2100 range checks are unchanged. A
fourth refinement rejects anything after `maxDate` with `date.notInFuture`
when the ceiling is a "today", so the message says *why* rather than
restating the range.

### `createTransactionSchema` takes the day

```ts
export function createTransactionSchema(
  t: TransactionValidationTranslator,
  options: { today: string; maxDate?: string },
)
```

- `date: isoDateField(t, options.maxDate ?? options.today)`
- `paymentDate: isoDateField(t, options.today).nullable()` — `null` is the
  unpaid state and must survive the schema untouched, the same way `cardId`
  and `description` already accept `null` rather than only `undefined`.
- A guarded `superRefine`: when both are present and `paymentDate > date`,
  one issue on `path: ["paymentDate"]` with `paymentDate.afterDate`. Guarded
  so a payload that already failed either field's own check does not collect
  a second issue on the same path — `.claude/rules/validation.md`.

`today` is a server-computed `YYYY-MM-DD` passed down as a prop, exactly as
`TransactionFiltersPanel` already receives it. A client-side `new Date()`
could sit a day either side of the server's across a timezone boundary and
disagree with the action about what "today" is.

### Occurrence dates are bounded by their neighbours, not by today

`updateTransaction` serves both the one-off edit form and every row of the
installment plan editor. A plan created today generates future-dated
payments, so capping `date` at today there would make each of those rows
unsavable from the moment it exists.

So the action picks the ceiling from the row it is about to write:

| Row | `date` ceiling |
| --- | --- |
| One-off (`recurringTransactionId === null`) | today |
| Plan occurrence | `MAX_TRANSACTION_DATE` |

Occurrence dates are instead constrained by the chain rule: **each
occurrence's date is greater than or equal to the previous live
occurrence's**.

- **Backend** (`updateTransaction`, plan rows only): fetch the nearest live
  sibling ordered before this row and reject a date earlier than it, with
  `date.beforePrevious`.

  It deliberately does *not* also enforce "≤ the next occurrence". Saving is
  per row, so that second half would deadlock a legitimate reshuffle: moving
  `[Jan, Feb, Mar]` to `[Jan, Apr, May]` has no valid one-row-at-a-time path
  if each save must satisfy both neighbours. The client blocks the broken
  intermediate state from being *reached* through the UI; a forged request
  can only break the chain in the direction that has to stay open anyway.

- **Frontend** (`installment-occurrences-table.tsx`): the whole chain is
  validated live against the table's current draft values. See §5.

### Start dates

`createRecurringTransactionSchema` and `createInstallmentSchema` both cap
`startDate` at today, through the same `isoDateField(t, today)` ceiling. A
recurrence or plan starts today or earlier; its generated occurrences run
forward from there.

The filter panel's From/To are **not** capped. They are a view over the data,
not data entry, and capping `to` would make every future-dated occurrence
permanently unreachable in the list.

### New message keys

Under `validation.transactions`, added to `en-US`, `pt-BR`, and `de-DE` in
the same commit (`src/i18n/messages.spec.ts` asserts identical key sets):

- `date.notInFuture`
- `date.beforePrevious`
- `paymentDate.invalid`
- `paymentDate.notInFuture`
- `paymentDate.afterDate`

Each is added to the `TransactionValidationKey` union so a real
`getTranslations("validation.transactions")` stays assignable.

## 3. New UI primitives

### `src/components/ui/switch.tsx`

Added through the shadcn CLI in the project's `base-vega` style — not
hand-rolled, and not a restyled checkbox.

### `src/components/ui/date-picker.tsx` — a `maxDate` prop

```ts
/** `YYYY-MM-DD`. Days after this are unselectable and unreachable. */
maxDate?: string;
```

Passed to `Calendar` as **both** `disabled={{ after: … }}` and `endMonth`.
`disabled` alone leaves the user paging through empty future months;
`endMonth` alone would not stop a date already sitting in `value`. The
existing local-vs-UTC midnight handling is unchanged — `maxDate` converts
through the same `toLocalMidnight` helper the selection already uses.

### `src/components/ui/money-input.tsx`

A controlled, masked currency field.

- Renders `type="text"` with `inputMode="decimal"`. Not `type="number"`,
  which permits `-`, `e`, and arbitrary decimal places, and whose spinner is
  meaningless for a masked field.
- State is a digit string. Every keystroke strips non-digits, so `-` and `e`
  cannot be entered at all rather than being rejected after the fact.
- The last two digits are always the decimals: typing `12345` displays
  `123.45`. Digits are capped at 12 (ten integer, two decimal), matching
  `MAX_TRANSACTION_AMOUNT`.
- Grouping and separators follow the user's stored `NumberFormat` —
  `COMMA_DOT` gives `1,234.56`, `DOT_COMMA` gives `1.234,56` — reusing the
  locale carriers already in `src/lib/format.ts`. This follows the saved
  preference, not the UI language, for the reason `formatMoney` documents.
- `onValueChange` emits the canonical `"1234.56"` string. Money crosses this
  component's boundary as a string in both directions and never becomes a
  float.

Because the display is fully derived from a digit string, this field does
**not** hit the mid-edit hazard documented on `RowValues` in
`installment-occurrences-table.tsx` — there is no free-form `.` or trailing
`0` for a re-commit to drop. That is what makes it safe to replace that
table's deliberately uncontrolled amount input in §5.

### Form pages read `numberFormat`

Every page rendering a form with an amount field adds `numberFormat` to its
`prisma.user` select, alongside the `dateFormat` it already reads, and passes
a server-computed `today` (`toIsoDate(new Date())`) down.

## 4. The three creation/edit forms

Common to all: `form.amountLabel` reads **"Value"**, and the amount field
becomes `MoneyInput`. Since `MoneyInput` is controlled from `defaultValues`,
its value is present in the server-rendered HTML — the concern
`.claude/rules/ui.md` raises about a bare `register()`-ed input does not
apply, and no separate `defaultValue` is needed.

### `transaction-form.tsx`

The "Already paid" `Checkbox` becomes a `Switch`. When on, a `DatePicker`
labelled **"Payment date"** appears beside it, with
`maxDate` set to the earlier of today and the transaction's `date`.

- Toggling on seeds `paymentDate` with that same earlier-of value. For a
  one-off, `date` is itself ≤ today, so it resolves to the transaction's own
  date — always valid, never a guess about a day the user did not choose.
- Toggling off writes `null`. The date is stored only while the switch is on.
- Editing `date` backwards past an already-set `paymentDate` leaves a stale
  value the picker can no longer reach; the `superRefine` surfaces it as a
  field error rather than silently rewriting what the user picked.

Layout: description narrows from `lg:col-span-9` to `lg:col-span-6`, and the
switch (`lg:col-span-3`) and its picker (`lg:col-span-3`) take the rest of
that row — 6 + 3 + 3 = 12. Without the narrowing the row would total 15 and
wrap the picker onto a line of its own. With the switch off, the row simply
runs three columns short; CSS grid needs no media query for that.

### `recurring-transaction-form.tsx`

- Description and Repeats become `lg:col-span-6` each, replacing today's 9/3.
  This is the 50/50 default in `.claude/rules/ui.md`; at `col-span-3` the
  select read as visibly narrower than every text field around it.
- `startDate` gets `maxDate={today}`.

### `installment-form.tsx`

- Description takes its own `lg:col-span-12` row. Repeats and Number of
  payments sit below it at `lg:col-span-6` each.
- `startDate` gets `maxDate={today}`.

### Every `Select` renders a label, not a raw value

`<SelectValue />` with no children renders the raw value string. Base UI's
`resolveSelectedLabel` can only find a label through the Root's `items` prop,
which none of these selects pass, so it falls through to `serializeValue` —
which is why the frequency select shows `MONTHLY` and the filter type select
shows nothing at all for its `null` "All" entry.

The fix is a function child on each, which takes precedence over that whole
lookup:

```tsx
<SelectValue>
  {(value) => (value === null ? t("filters.any") : t(TYPE_LABEL_KEYS[value]))}
</SelectValue>
```

Applies to four selects: frequency in both `recurring-transaction-form.tsx`
and `installment-form.tsx`, and **both** the type and show selects in
`transaction-filters.tsx`. Show was not reported but has the identical
defect, currently rendering `all`/`single`/`recurring`/`installments`.

Both frequency selects also get `alignItemWithTrigger={false}`, so the popup
opens below the trigger instead of overlaying it.

## 5. The installment plan editor

### Description becomes a series field

`description` moves out of `installment-occurrences-table.tsx` and into
`installment-series-form.tsx`, joining type, category, and card as a field
that classifies the whole series.

- `createInstallmentSeriesSchema` picks up `description` from
  `sharedTransactionFields` — same bounds, same `null` handling.
- `updateInstallmentSeries` writes it to the definition and, in the same
  `prisma.$transaction`, to every live occurrence via the existing
  `updateMany`.
- The occurrences table loses its Description column, its
  `descriptionRefs`, and the `occurrenceDescriptionLabel` key.
- `installments.seriesNote` is updated to name description alongside
  category, card, and type.

### Paid becomes an action, not a cell

The per-row checkbox is removed. Each row's action group is Save, then two
icon-only buttons — **Mark as paid** and **Delete** — each with a `Tooltip`,
per `.claude/rules/ui.md`'s rule for a control whose accessible name is not
its visible text.

"Mark as paid" opens a small dialog holding a single `DatePicker`, capped at
the earlier of today and that occurrence's date, and seeded with the same
value. Its `aria-label` carries the occurrence index, the way every other
per-row control here already does, so screen readers can tell the rows apart.
Confirming sets `paymentDate`; a row that is already paid offers clearing it,
which writes `null`.

The table's columns end up as **index, Date, Value, Payment date, Actions** —
Description leaves for the series form and the Paid checkbox is replaced by
the new Payment date cell, which shows the formatted date when paid and the
same "Not paid" badge the list uses (§6) when not, so the two views agree.

### The chain is validated across the whole table

Draft dates already live in this component's `values` state. Validity is
derived from them during render, not stored:

- A row is invalid when its draft date is earlier than the previous visible
  row's draft date, or when its `paymentDate` is later than its draft date.
- An invalid row's date picker gets `invalid` (`aria-invalid`) and
  destructive styling.
- **Every** Save button disables while any row is invalid — not just the
  offending row's. The requirement is that nothing saves until all dates are
  corrected, and a per-row block would let a user commit half a reshuffle and
  then navigate away.
- A destructive `Alert` renders above the table explaining what happened:
  payments must stay in order, and which rows need fixing.

Changing a date re-derives the whole chain, so fixing an earlier row clears
the flags on the rows it was breaking without any explicit invalidation step.

Ordering note: rows render in `occurrence.index` order — the stable,
creation-time numbering, which is also what the list's `n/N` badge shows.
"Previous" throughout means the previous *visible* row, since an
individually-deleted occurrence is hidden locally rather than removed from
the `occurrences` prop.

## 6. The transactions list

### Column order

Description, Value, Category, Card, Type, Date, Payment date, Actions.

The sortable columns are no longer contiguous, so the header stops mapping
`SORTABLE` and then hardcoding the rest. It renders from one ordered
descriptor list instead:

```ts
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

Body cells reorder to match. `colSpan` on the empty row stays 8. The `sort`
URL parameter keeps its existing values — `amount` remains the sort key even
though the column now reads "Value" — so links already in the wild keep
working.

### Payment date column

Replaces the Paid column. Paid rows show the formatted date. Unpaid rows show
`<Badge variant="secondary">Not paid</Badge>` — secondary rather than
destructive, because an unpaid expense is a state, not an error, and a table
of red badges would read as a page full of problems. Recurring rows keep
`—`: an ongoing recurrence is a definition, and has no payment to describe.

Message keys: `table.amount` becomes "Value", `table.paid` becomes
`table.paymentDate` ("Payment date"), and `table.paidYes`/`table.paidNo` are
replaced by `table.notPaid` ("Not paid"). The occurrences table's
`table.amount` header picks up "Value" for free.

### The empty state opens the type menu

`NewTransactionMenu` gains `variant?: "button" | "link"`. The `"link"`
variant renders the trigger with the underlined link styling the empty state
uses today, taking its label from `table.emptyCta`. The empty state renders
that component instead of a bare `Link` to `/transactions/new`, so both entry
points offer the same three choices.

`TransactionTable` is a Server Component; embedding this Client Component in
it needs nothing special. The "no transactions match these filters" branch
keeps its plain "Clear filters" link — that one is not a creation entry
point.

Its `DropdownMenuContent` widens from `max-w-xs` to `min-w-64 max-w-sm`.

### The filter panel becomes a bordered container

```tsx
<Collapsible className="rounded-md border">
  <CollapsibleTrigger render={<button className="flex w-full items-center justify-between gap-2 rounded-t-md bg-muted px-4 py-3 …" />}>
    {title} {badge} {chevron}
  </CollapsibleTrigger>
  <CollapsibleContent>
    <div className="grid grid-cols-12 gap-4 p-4">…</div>
  </CollapsibleContent>
</Collapsible>
```

The container mirrors the table's own `rounded-md border`, so the two read as
one stack. The header bar is the trigger and carries the highlight:
`bg-muted` is the token `.claude/rules/ui.md` records as deliberately tuned
to read as a visible highlight against the page background, so no one-off
shade is introduced. The chevron keeps its existing rotate-on-expand
transition, and the active-count badge moves into the bar.

## 7. Testing

Unit specs to update or add:

- `src/lib/validations/transaction.spec.ts` — the today ceiling on both sides
  of the boundary, `paymentDate` null/valid/future/after-date, and that an
  invalid `date` does not also produce a `paymentDate.afterDate` issue.
- `src/lib/validations/installment.spec.ts` — `startDate` ceiling, and the
  series schema's new `description`.
- `src/lib/actions/transactions.spec.ts` — the one-off vs plan-row ceiling
  split, and the "≥ previous occurrence" rejection.
- `src/lib/actions/installments.spec.ts` — description written to the
  definition and every live occurrence.
- `src/components/ui/money-input.spec.tsx` — **new**: digit masking, both
  number formats, the 12-digit cap, and that `-`/`e` never appear.
- `src/components/transactions/transaction-form.spec.tsx` — the switch
  reveals the picker, toggling off clears the value, the picker is capped.
- `src/components/transactions/transaction-table.spec.tsx` — column order,
  the "Not paid" badge, `—` for recurring rows.
- `src/components/transactions/transaction-filters.spec.tsx` — "All" renders
  in both the type and show triggers.
- `src/components/transactions/installment-occurrences-table.spec.tsx` — the
  chain rule flags the right rows, disables every Save, and shows the alert;
  the mark-as-paid dialog caps and writes correctly; description is gone.
- `src/components/transactions/new-transaction-menu.spec.tsx` — the link
  variant opens the same three items.
- `src/i18n/messages.spec.ts` passes with the new and removed keys across all
  three catalogs.

End-to-end (`e2e/transactions.spec.ts`, `e2e/db.ts`): `db.ts` switches from
`isPaid` to `paymentDate`. A future date cannot be picked on the one-off
form, and — per `.claude/rules/validation.md`'s "test the bypass" rule — a
direct action call carrying a future `date`, or a `paymentDate` after `date`,
is rejected server-side.

## 8. Out of scope

- Widening any money column, and everything in
  `docs/superpowers/specs/2026-08-16-transactions-followups.md` — the
  `AsyncCombobox` search defect in particular is untouched here.
- Marking a transaction paid from the main list's row actions. The request
  covered the plan editor only; the list keeps Edit and Delete.
