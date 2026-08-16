# Transaction Management — Design Spec

**Date:** 2026-08-16
**Status:** Awaiting review (revision 2)

## Overview

The third CRUD feature, following `Category` and `Card`. Users record money in
and out through a new `/transactions` section.

Three things make this materially bigger than the two CRUDs before it:

1. **There are three kinds of transaction, from the user's point of view** —
   one-off, recurring (ongoing), and installments (a fixed number of
   occurrences, generated up front). The first two are separate tables; the
   third is a `RecurringTransaction` with a flag, surfaced entirely through
   the `Transaction` rows it generates.
2. **The list is a union of two tables.** All three kinds appear interleaved
   in a single sorted, filtered, paginated table.
3. **The list is stateful.** Filters, ordering, and pagination all live in the
   URL, so any view is linkable, refreshable, and back-button-correct.

This revision also moves the existing feature routes out from under
`/dashboard`, which becomes a leaf route again.

## Goals

- Full CRUD for one-off transactions.
- Full CRUD for **recurring** definitions — ongoing, no end, no rows
  generated here.
- Full CRUD for **installments** — a recurrence with a fixed occurrence
  count, whose `Transaction` rows are all generated eagerly at creation, up to
  a hard maximum of 100.
- A single union list at `/transactions`, paginated at 50 rows per page,
  ordered by date descending by default.
- Filters: category, card, transaction type, period, and a "show" filter
  distinguishing all four cases (all / one-off / recurring / installments) —
  collapsible, applied explicitly.
- Filters, ordering, and pagination fully represented in the URL.
- A reusable searchable async select, fed by its own API endpoints, used for
  the category and card fields in both the forms and the filter row.
- Amounts and dates formatted from the user's stored `currency`,
  `numberFormat`, and `dateFormat`.
- Feature routes moved to the top level: `/transactions`, `/categories`,
  `/cards`, with `/dashboard` reduced to the dashboard page itself.

## Non-Goals

- **Growing an ongoing recurrence over time.** No cron and no scheduled
  generation. An ongoing `RecurringTransaction` writes exactly one row and no
  `Transaction` rows; `nextRunDate` is set as the cue a later feature will
  read. Installments are the only kind that generates rows, and it does so
  once, at creation.
- Import, export, and attaching transactions to expense plans.
- A preferences page for `currency`/`numberFormat`/`dateFormat`. This feature
  only *reads* those fields.
- Restoring a soft-deleted row. No trash UI, per `.claude/rules/database.md`.
- A cap on transactions per user. Categories and cards are capped at 50
  because they are a small hand-curated set; transaction history is the
  opposite, and pagination is what makes it manageable. The 100-occurrence
  installment limit is a per-series bound, not a per-user one.
- Changing an installment's frequency, start date, or occurrence count after
  creation — see the decision below.

## Decisions

### One flag separates the two recurrence kinds

The only schema change in this feature:

```prisma
// True when the whole series was generated eagerly at creation and the
// recurrence is closed — `occurrencesCount` is then the final total and
// `nextRunDate` stays null. False for an ongoing recurrence, which
// generates nothing here and carries a `nextRunDate` for the future cron.
fixedOccurrencesCount Boolean @default(false) @map("fixed_occurrences_count")
```

At the database level the two kinds are one model. At the UI level they are
two different things with their own create pages, their own filter value, and
their own representation in the list. The existing comments on
`occurrencesCount` and `nextRunDate` are updated to point at this flag.

| | `fixedOccurrencesCount` | `occurrencesCount` | `nextRunDate` | Generates rows |
|---|---|---|---|---|
| Recurring (ongoing) | `false` | `0` | `startDate` | no |
| Installments | `true` | the final total (1–100) | `null` | yes, at creation |

### Installments are represented by their occurrences, not by their definition

A recurring definition and an installment plan appear in the list in opposite
ways:

- **Recurring (ongoing)** — one collapsed row standing in for the series. Any
  `Transaction` rows it eventually generates stay hidden behind it.
- **Installments** — every generated `Transaction` appears as its own row,
  with a `3/12` badge marking its position in the series. The definition
  itself never appears; the same money is never listed twice.

So the original rule "no row with a `recurringTransactionId` is returned"
holds for ongoing recurrences only. Installment occurrences are exactly the
rows that carry one, and they are the whole point of the kind.

The badge's numerator is a `ROW_NUMBER() OVER (PARTITION BY
recurring_transaction_id ORDER BY date, id)` computed in a CTE **before the
period filter and before the soft-delete filter**, so occurrence 7 of 12 reads
`7/12` whether the window starts halfway through the series or the user has
deleted an earlier row. Numbering a series by its surviving rows would
renumber every later occurrence each time one is deleted, which is not what a
"3rd of 12 payments" label means. The denominator is the parent's
`occurrencesCount`.

### A recurring row's date is its latest occurrence *within the filter window*

An ongoing recurrence has no single date, so one is derived:

```
effective_date = COALESCE(
  (SELECT MAX(x.date) FROM transactions x
    WHERE x.recurring_transaction_id = r.id
      AND x.deactivated_at IS NULL
      AND x.date <= :periodEnd),
  r.start_date
)
```

That value drives filtering, ordering, and display alike. Consequences, all
intended:

- **The window, not "today", is the cutoff.** A period ending in the future
  pulls in future occurrences, and the row reports the latest one up to that
  end date.
- **A recurrence appears exactly when it has an occurrence in the window.**
  If its latest occurrence at or before `periodEnd` falls before
  `periodStart`, it has nothing in the window and drops out — the same rule a
  one-off transaction gets.
- **An ongoing recurrence with no generated rows falls back to `startDate`.**
  Since nothing generates them, that is *every* ongoing recurrence today. The
  `MAX(...)` arm is written correctly now so the list becomes right on its own
  the day the generation feature lands, with no change here.

The date cell shows both dates, so the fallback is never mistaken for a real
charge: `08/14/2026 (Started 09/12/2024)`. Installment rows are plain
transactions and show a single date.

### The query is one raw `UNION ALL`, not two queries merged in JavaScript

`src/lib/transactions/list-query.ts` owns a single raw SQL statement
projecting both tables into a common row shape, plus a matching `COUNT(*)`.
Ordering, `LIMIT`, and `OFFSET` happen in Postgres. Three arms:

| Arm | Source | Included when `show` is |
|---|---|---|
| `single` | `Transaction` where `recurring_transaction_id IS NULL` | `all`, `single` |
| `installment` | `Transaction` joined to a parent with `fixed_occurrences_count = true` | `all`, `installments` |
| `recurring` | `RecurringTransaction` where `fixed_occurrences_count = false` | `all`, `recurring` |

Merging Prisma queries in application code was considered and rejected:
paginating a merge correctly requires fetching *every* matching row of all
three arms before slicing, which is unbounded in a user's transaction history
— the one table here with no cap on it. A Postgres view was also rejected: it
adds a migration, Prisma models views poorly, and the recurring effective date
depends on `periodEnd`, which a static view cannot take as a parameter.

The cost is real and accepted: raw SQL, hand-written result typing, and no
meaningful coverage from the Prisma-mocking unit tests. It is contained by
keeping the module's public surface to one function, testing the SQL/param
building as a pure function, and covering behavior in e2e against a real
database.

### Ordering is always total, so pages cannot overlap or drop rows

`ORDER BY date DESC` alone is not a total order — several transactions share a
date routinely, and Postgres is free to return tied rows in a different order
per query. With `LIMIT`/`OFFSET` pagination that means a row can appear on two
consecutive pages, or on neither. Every ordering therefore ends with the same
tie-break chain:

```
ORDER BY <sort column> <dir>, effective_date DESC, kind ASC, id ASC
```

`id` is unique within each arm and `kind` separates the arms, so the final
order is total in every case.

`description` is nullable on both tables and sorts `NULLS LAST` in both
directions — a screenful of blank cells at the top is never the useful end of
a sort.

Every arm carries `deactivated_at IS NULL`, as does the `MAX(x.date)`
subquery and the installment arm's join to its parent: a soft-deleted
transaction, recurrence, or occurrence is invisible here, exactly as in the
categories and cards lists.

### `sort=category` orders on the *resolved* name, not `categories.name`

A preset category stores English text in `name` and is translated at render
time via `resolveCategoryDisplay` — `categories/page.tsx` already sorts in
application code for exactly this reason. Ordering the union by the raw column
would sort a pt-BR user's list by words they never see.

Because categories are capped at 50, the page resolves every active category's
display name once — it needs the map anyway to render the category column —
and passes it into the query as a joined `VALUES (id, sort_name)` list.
Postgres then orders on the text the user actually reads, and pagination stays
exact.

`sort=description`, `sort=amount`, and `sort=date` order on real columns and
need none of this.

### Invalid URL state falls back to defaults; it never errors

`searchParams` is attacker-controlled input like any other, so it is parsed by
a zod schema (`src/lib/validations/transaction-filters.ts`). Unlike a form
schema it **never surfaces an error**: an unparseable value is replaced by its
default. `?sort=drop%20table` renders page 1 by date descending; `?page=-4`
clamps to 1; `?page=999` past the last page clamps to the last page; a `from`
later than `to` reverts both to their defaults. A URL someone was handed
should render a page, not a 500.

Defaults are **omitted** from the URL rather than written into it, so "Clear
filters" produces a bare `/transactions`.

### Filters are applied explicitly, not on every keystroke

The filter panel holds local state and only rewrites the URL when **Apply** is
pressed — a period change alone would otherwise fire three refetches while the
user picks two dates. **Clear** resets every control to its default and
navigates to the bare path. Applying always resets `page` to 1: staying on
page 7 of a result set that just shrank to two pages is how empty tables
happen.

### Installments generate up to 100 rows in one transaction

On create, `createInstallmentPlan` writes the `RecurringTransaction` and all N
`Transaction` rows inside a single `prisma.$transaction`, so a failure
half-way through leaves nothing behind. N is validated at 1–100; the bound
exists because eager generation is unbounded work driven by a user-supplied
number, and 100 monthly occurrences is already eight years.

Occurrence dates come from a pure `occurrenceDates(startDate, frequency, count)`
in `src/lib/transactions/occurrences.ts`, stepping `DAILY +1d`, `WEEKLY +7d`,
`BIWEEKLY +14d`, `MONTHLY +1mo`, `QUARTERLY +3mo`, `SEMIANNUAL +6mo`,
`YEARLY +1y`. Month-length overflow **clamps to the last day of the target
month** — a plan starting Jan 31 runs Feb 28, Mar 31, Apr 30 — rather than
rolling into the following month, which would drift the whole series forward.
Every generated row copies the definition's `type`, `amount`, `categoryId`,
`cardId`, and `description`, and is written with `isPaid: false`.

### On an installment, some fields belong to the series and some to the row

The installment edit page has two halves, and the split is the point of the
page:

- **Series fields — `category`, `card`, `type`** — edited once and written to
  the definition *and* every one of its non-deleted occurrences in a single
  `prisma.$transaction`. These are the fields that classify the whole series;
  having them drift row-by-row would make the category column meaningless.
- **Occurrence fields — `amount`, `date`, `description`, `isPaid`** — edited
  per row, independently, through the same `updateTransaction` action a
  one-off uses. A final installment that differs by a few cents, or one that
  cleared late, is normal.

**`frequency`, `startDate`, and the occurrence count are fixed at creation**
and shown read-only. Changing any of them means recomputing dates the user may
have already adjusted by hand, or deleting rows they may have marked paid;
neither has a safe answer. Restructuring a plan means deleting it and creating
a new one, and the delete dialog says so.

Type is a series field because `cardId` must be null exactly when the type is
`INCOME`; letting one occurrence flip to income would break that invariant for
the row while the series still carries a card.

### Deleting an installment plan deletes its occurrences too

Deleting an ongoing recurrence soft-deletes only the definition — its
generated rows, if a future feature made any, stay as history the same way
`onDelete: SetNull` intends.

An installment plan is the opposite: its occurrences *are* its representation
in the list, so soft-deleting the definition alone would delete nothing the
user can see. Deleting one soft-deletes the definition and every one of its
occurrences in a single `prisma.$transaction`, and the confirmation dialog
names the number of transactions that will disappear.

A single occurrence can also be deleted on its own from the list's row
actions; the rest of the series is untouched and keeps its original `n/N`
numbering, per the window function described above.

### A generated occurrence's edit action opens its plan

Per the requirement, a row generated by an installment plan does not have its
own edit page. Its Edit action links to
`/transactions/installments/<planId>/edit?occurrence=<transactionId>`, and the
page scrolls that occurrence into view and focuses its first field. The
`occurrence` param is validated like any other input and ignored if it does
not name a row of that plan.

### A card is never attached to income

`Transaction.cardId`/`RecurringTransaction.cardId` are documented
null-when-`INCOME`. Every form hides and clears the card field when type is
`INCOME`; the schemas enforce it with a guarded `superRefine` that **rejects**
a payload carrying both rather than silently nulling the card — a mismatch can
only come from a forged request, and quietly accepting it would hide a bug.

For an `EXPENSE`, the card stays **optional**: cash spending is real, and the
column is nullable.

### Dates are calendar dates, normalized to UTC midnight

`Transaction.date` and `RecurringTransaction.startDate` are `DateTime` columns
holding what users think of as plain calendar dates. Every write normalizes to
midnight UTC, and every read formats from UTC parts, so a user in UTC−3 never
sees a transaction slide to the previous day. Period filtering compares
against `from` at `00:00Z` inclusive and `to` at `00:00Z` of the following day
exclusive, which makes the end date inclusive as users expect. Generated
occurrence dates are computed in UTC for the same reason.

### Money and dates format from the user's stored preferences

New `src/lib/format.ts`:

- `formatMoney(amount, { currency, numberFormat })` — `Intl.NumberFormat` with
  the currency code from `User.currency` and grouping/decimal separators
  chosen by `User.numberFormat` (`COMMA_DOT` → `1,234.56`; `DOT_COMMA` →
  `1.234,56`), independent of the UI language.
- `formatDate(date, dateFormat)` — assembles `MM/DD/YYYY`, `DD/MM/YYYY`, or
  `YYYY-MM-DD` from UTC parts per `User.dateFormat`.

The list page reads the three fields off the session user once and formats
server-side, so no `Decimal` crosses the server/client boundary.

### The category and card selects fetch from their own API endpoints

A new `AsyncCombobox` (`src/components/ui/async-combobox.tsx`) backs every
category and card field in this feature — all forms and the filter row:

- Fetches from an endpoint, **10 results per page**, always ordered by name
  ascending.
- Search is debounced **300ms**; a new search resets to page 1 and aborts the
  in-flight request via `AbortController`.
- Scrolling to the bottom of the open list appends the next page
  (`IntersectionObserver` on a sentinel row), with a loading row while in
  flight.
- Distinct empty ("No results"), loading, and error states.

Two endpoints back it:

| Route | Source |
|---|---|
| `GET /api/categories/options` | active categories, display names resolved |
| `GET /api/cards/options` | active cards |

Query params `q` (trimmed, max 100), `page` (int ≥ 1), and `locale`; response
`{ items: { id, name }[], hasMore: boolean }`. Both scope every read to the
session user and return `401` with no body detail when there is no session —
the only error status either endpoint produces. Malformed `q`/`page` fall back
to defaults, matching the list page's policy above.

**The `locale` param is not optional.** Route handlers live at `/api/…`,
outside the `[locale]` segment, so next-intl cannot resolve a locale there —
the same constraint `.claude/rules/i18n.md` documents for Server Actions. The
client passes `useLocale()`; the handler validates it with `hasLocale` and
falls back to `routing.defaultLocale`.

The categories endpoint cannot search or sort in SQL, for the preset-name
reason above: it loads the user's active categories (≤ 50), resolves display
names, filters case-insensitively on the resolved name, sorts with
`Intl.Collator(locale)`, and slices the requested page. The cards endpoint has
no such constraint and pages in SQL (`orderBy: { name: "asc" }`, `skip`,
`take: 11` to detect `hasMore`), matching how the cards list already orders.

On an edit page the selected row's label is passed in from the server as
`selectedOption`, so the field renders its current value on first paint without
waiting for a fetch — the same first-paint concern `.claude/rules/ui.md`
documents for `register()`-ed inputs. For a category, that label is the
resolved display name.

### Everything else follows the two CRUDs already shipped

Server Actions in `src/lib/actions/transactions.ts`,
`src/lib/actions/recurring-transactions.ts`, and
`src/lib/actions/installments.ts`, each taking the active `locale` as its last
argument and returning
`{ success: true } | { success: false; error: string }`; ownership re-derived
from the session on every call; soft delete via `deactivatedAt`, never a row
delete; `revalidatePath("/[locale]/transactions", "page")` after every
mutation; zod schema factories taking a translator, shared by client and
server.

One addition specific to this feature: `categoryId` and `cardId` arrive from
the client, so every action verifies the referenced rows are **owned by the
session user and active** before writing. A category id belonging to someone
else fails the same way a nonexistent one does.

## Phase 0 — Move the feature routes out of `/dashboard`

A prerequisite refactor, landing as its own commit before any transaction
work, so the new feature is built at its final path rather than moved later.

`/dashboard` becomes a leaf route again; each feature gets a top-level path:

| Before | After |
|---|---|
| `/dashboard` | `/dashboard` (unchanged) |
| `/dashboard/categories/**` | `/categories/**` |
| `/dashboard/cards/**` | `/cards/**` |

The sidebar shell currently lives at `src/app/[locale]/dashboard/layout.tsx`
and would no longer wrap the moved routes, so it becomes a **route group**:
`src/app/[locale]/(app)/layout.tsx`, with `dashboard/`, `categories/`,
`cards/`, and the new `transactions/` as its children. A route group adds no
URL segment, so the shell is unchanged from the user's side.

What has to move with the routes:

- `src/proxy.ts` — `PROTECTED_PATHS` is currently an exact-match list holding
  only `/dashboard`, which means the moved routes would be unguarded. It
  becomes a **prefix** check over `/dashboard`, `/categories`, `/cards`,
  `/transactions`. (The middleware check is a render optimization, not a
  security boundary — every page still calls `auth.api.getSession()` — but
  leaving it exact-match would silently stop doing its job.)
- `revalidatePath` targets in `src/lib/actions/categories.ts` and
  `cards.ts`.
- `router.replace` targets in `CategoryForm` and `CardForm`, and the `Link`
  hrefs in both row-action components and both list/new/edit pages.
- `DashboardNavMenu`'s three `pathname` checks and hrefs.
- `PageProps<"/[locale]/dashboard/…">` type arguments on the edit pages.
- `e2e/categories.spec.ts`, `e2e/cards.spec.ts`, and
  `e2e/route-protection.spec.ts` path helpers.

`/categories`, `/cards`, and `/transactions` all clear the guard in
`src/i18n/locale-segment.spec.ts` — none of them begins with a one-to-three
letter hyphen-delimited part that could be mistaken for a language tag.

Nothing outside this list changes: sign-in/sign-up redirects still target
`/dashboard`, which still exists.

## Data Model

One migration, adding one column:

```prisma
model RecurringTransaction {
  // …
  // True when the series was generated eagerly at creation and is closed:
  // `occurrencesCount` is the final total and `nextRunDate` stays null.
  // False for an ongoing recurrence, which carries a `nextRunDate` for the
  // cron and whose `occurrencesCount` grows as rows are generated.
  fixedOccurrencesCount Boolean @default(false) @map("fixed_occurrences_count")
}
```

Existing rows default to `false`, which is correct: everything that exists
today predates installments.

Fields this feature writes:

- `Transaction`: `userId`, `categoryId`, `cardId`, `type`, `amount`,
  `description`, `date`, `isPaid`, `recurringTransactionId` (installment
  occurrences only), `deactivatedAt`. `isImported` is never set here.
- `RecurringTransaction`: `userId`, `categoryId`, `cardId`, `type`, `amount`,
  `description`, `frequency`, `startDate`, `fixedOccurrencesCount`,
  `occurrencesCount`, `nextRunDate`, `deactivatedAt`.

## Routes

Each ships a `loading.tsx` with a skeleton mirroring its real layout, per
`.claude/rules/ui.md`.

| Path | Purpose |
|---|---|
| `/transactions` | The union list |
| `/transactions/new` | Create a one-off |
| `/transactions/[id]/edit` | Edit a one-off |
| `/transactions/recurring/new` | Create an ongoing recurrence |
| `/transactions/recurring/[id]/edit` | Edit an ongoing recurrence |
| `/transactions/installments/new` | Create an installment plan |
| `/transactions/installments/[id]/edit` | Edit a plan and its occurrences |

Next matches the static `recurring` and `installments` segments ahead of
`[id]`, so the families never collide.

## URL Contract

| Param | Values | Default |
|---|---|---|
| `from` / `to` | `YYYY-MM-DD` | day 1 of the current month → today |
| `category` | a category id | all |
| `card` | a card id | all |
| `type` | `INCOME` \| `EXPENSE` | all |
| `show` | `single` \| `recurring` \| `installments` | all |
| `sort` | `date` \| `amount` \| `category` \| `description` | `date` |
| `dir` | `asc` \| `desc` | `desc` |
| `page` | 1-based integer | `1` |

## UX Flow

**Sidebar** — a new "Transactions" item (`ArrowRightLeft`, `size-6`) directly
below Dashboard and above Categories, labeled from
`dashboard.transactionsNavLabel`.

**List (`/transactions`)**

- Header: title, description, and a `DropdownMenu` trigger "New transaction"
  with three `DropdownMenuLinkItem`s — "One-off transaction", "Recurring
  transaction", "Installments" — routing to the three create pages, each with
  a one-line description of what it does.
- Filter panel: a shadcn `Collapsible` above the table, collapsed by default,
  its trigger showing a count badge of filters differing from their defaults.
  Inside, a 12-column grid holds category, card, type, show, and the period's
  two date fields, with **Clear** and **Apply** right-aligned on their own
  full-width row.
- Table columns: `Date | Description | Category | Card | Type | Paid |
  Amount | Actions`. Date, Description, Category, and Amount headers are
  server-rendered links toggling `sort`/`dir`, with an arrow marking the
  active one.
- Row kinds are distinguishable at a glance: an ongoing recurrence shows
  `08/14/2026 (Started 09/12/2024)` in its date cell and a `↻ Monthly` badge;
  an installment occurrence shows a single date and a `3/12` badge; a one-off
  shows neither.
- Amounts are right-aligned and signed: income `+`, expense `−`. Income uses a
  new `--success` token added to `src/app/globals.css` in both themes —
  `globals.css` has no green today, and `--destructive` would misread an
  ordinary expense as an error.
- Row actions: the established ellipsis-vertical `DropdownMenu` with a
  variant-`info` Edit link and a variant-`destructive` Delete opening a
  controlled `AlertDialog`. Edit targets the one-off edit page, the recurring
  edit page, or the parent plan's edit page with `?occurrence=`, according to
  the row's kind.
- Pagination: shadcn `Pagination`, rendered as links preserving every other
  param.
- The table body sits inside a `<Suspense>` keyed on the serialized search
  params, falling back to a row skeleton, so a filter, sort, or page change
  shows loading state immediately rather than freezing the current page.
- Empty state distinguishes two cases: no transactions at all (message plus a
  create call to action) versus none matching the current filters (message
  plus "Clear filters").

**Create/edit one-off (`/transactions/new`, `/transactions/[id]/edit`)** — a
12-column grid per `.claude/rules/ui.md`:

- Row 1: type (`RadioGroup`, Expense/Income, `lg:col-span-4`), amount
  (`lg:col-span-4`), date (`lg:col-span-4`).
- Row 2: category (`AsyncCombobox`, required, `lg:col-span-6`), card
  (`AsyncCombobox`, optional, `lg:col-span-6`) — the card field is hidden and
  its value cleared while type is `INCOME`.
- Row 3: description (`lg:col-span-9`), paid (`Checkbox`, `lg:col-span-3`).
- Submit: `col-span-12`, `w-full` on small screens,
  `lg:w-auto lg:justify-self-end`.

Type defaults to `EXPENSE` on create — unlike the card form's Debit/Credit,
these two are not equally likely. Date defaults to today. Required fields that
start empty (amount, category) get the `Label`'s asterisk; type and date do
not, since both are pre-filled.

**Create/edit recurring (`/transactions/recurring/…`)** — the same grid, with
start date in place of date, a frequency `Select` (the seven
`RecurringFrequency` values) in place of paid, and no paid field. A short note
states that this defines the recurrence only and that occurrences are not
generated yet, so an empty list is not read as a bug. Everything is editable
after creation, since nothing has been generated from it.

**Create installments (`/transactions/installments/new`)** — the recurring
form plus an occurrence-count field (1–100, required), and a live preview line
reading e.g. "12 transactions, 01/05/2026 → 12/05/2026" that updates as the
count, start date, or frequency changes, so the user sees the span before
committing to it.

**Edit installments (`/transactions/installments/[id]/edit`)** — two sections:

1. **Series** — category, card, and type, editable; frequency, start date, and
   occurrence count shown read-only with a note that changing them means
   creating a new plan. Saving rewrites the definition and every occurrence.
2. **Occurrences** — a table of the plan's transactions, each row editable in
   place (amount, date, description, paid) with its own Save, plus a per-row
   delete. `?occurrence=<id>` scrolls to and focuses the named row.

All forms redirect with `router.replace("/transactions")` on success, so a
finished form is not left in the history stack; the installment occurrence
rows save in place without navigating.

## Validation

`src/lib/validations/transaction.ts`,
`src/lib/validations/recurring-transaction.ts`, and
`src/lib/validations/installment.ts`, all schema factories taking a
translator, per `.claude/rules/validation.md`.

Shared rules:

- `amount` — coerced number, `> 0`, at most `9_999_999_999.99` (the
  `Decimal(12, 2)` ceiling), at most 2 decimal places.
- `categoryId` — trimmed string, 1–30 characters (a `cuid()` is 25; the same
  bound `cardIdSchema` already uses).
- `cardId` — same bound, optional/nullable.
- `description` — trimmed, optional, max 200 characters.
- `type` — `z.enum(["INCOME", "EXPENSE"])`.
- `date` / `startDate` — a valid date between `2000-01-01` and `2100-12-31`;
  the bounds exist so a typo'd year cannot write a row that sorts to one end
  of every list forever.
- A guarded `superRefine` rejecting a `cardId` when `type` is `INCOME`.

One-off only: `isPaid` boolean, defaulting to `false`.
Recurring and installments: `frequency` — `z.enum` over the seven
`RecurringFrequency` values.
Installments only: `occurrencesCount` — integer, 1–`MAX_INSTALLMENT_OCCURRENCES`
(100), named to match the column it becomes, exported as a constant and
interpolated into its message as `{max}`.
The installment *series* schema (used by the edit page) carries only
`categoryId`, `cardId`, and `type`.

`src/lib/validations/transaction-filters.ts` parses `searchParams` into a
typed filter object, substituting defaults for anything invalid rather than
reporting errors.

## Internationalization

New keys land in all three catalogs (`en-US`, `pt-BR`, `de-DE`) in the same
commit, per `.claude/rules/i18n.md`:

- `transactions.*` — page copy, table headers, filter labels, all four forms,
  the three-item new menu, delete dialogs (including the installment dialog's
  occurrence count), empty states, the recurring and `n/N` badges, the
  read-only-fields note, and the installment preview line.
- `validation.transactions.*`, `validation.recurringTransactions.*`,
  `validation.installments.*` — schema messages, with bounds interpolated as
  `{min}`/`{max}` rather than written into the copy.
- `dashboard.transactionsNavLabel` — the sidebar item.
- `ui.asyncCombobox.*`, `ui.pagination.*`, `ui.datePicker.*` — generic
  component copy, alongside the existing `ui.passwordInput` and `ui.sidebar`.

## New Components

Added from the shadcn registry (`base-vega` preset) via the shadcn skill:
`select`, `combobox`, `calendar`, `popover`, `collapsible`, `checkbox`,
`badge`, `pagination`.

Written for this feature:

- `src/components/ui/async-combobox.tsx` — the searchable, paginated,
  debounced select described above.
- `src/components/ui/date-picker.tsx` — `Calendar` in a `Popover`, formatting
  its trigger label through `formatDate`.
- `src/components/transactions/transaction-filters.tsx` — the collapsible
  filter panel.
- `src/components/transactions/transaction-form.tsx`,
  `recurring-transaction-form.tsx`, `installment-form.tsx`,
  `installment-series-form.tsx`, `installment-occurrences-table.tsx`,
  `transaction-row-actions.tsx`, `transaction-table.tsx`,
  `new-transaction-menu.tsx`.

## Testing

Unit (vitest):

- `src/lib/validations/transaction.spec.ts`,
  `recurring-transaction.spec.ts`, `installment.spec.ts` — every rule, both
  boundaries of every bound (including 100 and 101 occurrences), the
  income/card cross-field rule, key-echoing translator stub.
- `src/lib/validations/transaction-filters.spec.ts` — defaults when params are
  absent, every invalid value falling back rather than throwing, `page`
  clamping, `from > to` reverting, all four `show` values, and defaults
  omitted from a generated query string.
- `src/lib/transactions/occurrences.spec.ts` — each of the seven frequencies,
  month-end clamping (Jan 31 → Feb 28/29 → Mar 31), a leap year, the 100-row
  maximum, and UTC stability across a timezone offset.
- `src/lib/transactions/list-query.spec.ts` — the SQL and parameters built for
  representative filter combinations: each `show` value selecting the right
  arms, the one-off arm's `recurring_transaction_id IS NULL`, the installment
  arm's join on `fixed_occurrences_count = true`, the ongoing arm excluding
  fixed plans, the category `VALUES` join appearing only for `sort=category`,
  the tie-break chain terminating every `ORDER BY`, and `LIMIT`/`OFFSET`
  derived from `page`.
- `src/lib/format.spec.ts` — all six `numberFormat`/`dateFormat` combinations
  plus a non-USD currency, and UTC handling that does not shift a date across
  a timezone boundary.
- `src/lib/actions/transactions.spec.ts`, `recurring-transactions.spec.ts`,
  `installments.spec.ts` — no session, invalid payload, a category or card
  belonging to another user, a deactivated category or card, ownership on
  update/delete, soft delete never a hard delete, `nextRunDate` set to
  `startDate` for an ongoing recurrence and null for a plan, N rows generated
  for a plan of N, series edits reaching every occurrence, plan deletion
  soft-deleting definition and occurrences together, and locale forwarding.

Component (`renderWithIntl`):

- `async-combobox.spec.tsx` — debounce with fake timers (three keystrokes, one
  fetch), page-1 reset on a new search, appending on sentinel intersection,
  empty/loading/error states, keyboard selection.
- `transaction-filters.spec.tsx` — nothing navigates before Apply, Clear
  restores defaults, the badge count, and `page` reset on Apply.
- `transaction-form.spec.tsx`, `recurring-transaction-form.spec.tsx`,
  `installment-form.spec.tsx` — the card field disappearing and clearing on
  `INCOME`, validation messages, the occurrence-count bound, the preview line,
  submit states.
- `installment-occurrences-table.spec.tsx` — per-row save calling the action
  with only that row's values, and `?occurrence=` focusing the right row.
- `transaction-table.spec.tsx` — the ongoing row's dual date and badge, the
  `n/N` badge, signed amounts, and sort-header links carrying the right
  params.

e2e (`e2e/transactions.spec.ts`, `en-US` per convention):

- Create, edit, and delete a one-off; the same for an ongoing recurrence.
- Create a 12-occurrence plan and see 12 rows appear; edit one occurrence's
  amount without touching the rest; edit the series category and see every
  occurrence follow; delete the plan and see all 12 rows go.
- All three kinds interleaved in one list, ordered correctly.
- Each filter round-tripping through the URL, including a shared link
  rendering the same filtered view, and Clear returning to the bare path.
- Pagination across more than 50 rows, and sorting by each sortable column.
- A garbage query string rendering page 1 rather than erroring.
- Posting a transaction referencing another user's category id is refused.

Phase 0 has no new tests of its own — the existing `e2e/categories.spec.ts`,
`e2e/cards.spec.ts`, and `e2e/route-protection.spec.ts` are updated to the new
paths and are what proves the move, with a new case asserting a signed-out
visitor to `/categories` is redirected to login.
