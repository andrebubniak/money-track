# Card Management — Design Spec

**Date:** 2026-08-15
**Status:** Approved, ready for implementation planning

## Overview

The second CRUD feature in the app, directly following the `Category`
feature's shape. Users manage the `Card` records their transactions will
reference (a transaction's `cardId` is null exactly when its type is
`INCOME`). Full create/list/edit/(soft) delete through a new
`/dashboard/cards` page, reusing every architectural decision already made
for categories.

Unlike categories, the `Card` model already exists in `prisma/schema.prisma`
and is already migrated (`20260809003507_init`) — this feature adds no new
columns and needs no migration.

## Goals

- Full CRUD: create, list (table), edit, soft delete.
- Two fields only: `name` (required, 3–50 characters) and `type` (required,
  `DEBIT` or `CREDIT`, a radio group — not a dropdown, since there are
  exactly two mutually exclusive options always worth showing at once).
- A hard cap of 50 active cards per user, enforced server-side, matching the
  categories cap exactly (chosen for consistency over a domain argument,
  per user decision).
- The cards table is unpaginated, ordered by name ascending.

## Non-Goals

- Wiring `Card` into `Transaction`/`RecurringTransaction` create/edit forms —
  those don't exist yet either. This feature only manages the card records
  themselves.
- Restoring a soft-deleted card. `deactivatedAt` follows
  `.claude/rules/database.md`; there is no "trash" UI.
- Any icon, color, or description field — the card form is deliberately just
  the two fields the user specified.
- Presets or seeding. Categories seed 11 built-in rows per new user; cards
  have no equivalent, since a starting set of "generic" cards makes no sense
  the way starting expense categories do. Every card is user-created.

## Decisions

### The data model needed no changes

`Card` (`prisma/schema.prisma:104-122`) already has `name`, `type: CardType`
(`enum CardType { DEBIT CREDIT }`), `deactivatedAt`, and the `userId`
relation with `@@index([userId])`. `Transaction.cardId` and
`RecurringTransaction.cardId` already point at it with `onDelete: Restrict`.
This feature is UI/action work only — no `prisma migrate` step.

### `onDelete: Restrict` on the transaction side is why delete must be soft

A hard `DELETE` on a `Card` still referenced by any `Transaction` or
`RecurringTransaction` row would fail the FK constraint outright. Soft
delete via `deactivatedAt` (per `.claude/rules/database.md`) isn't just the
house style here, it's the only option that can't 500 on a referenced card —
matching `deleteCategory`'s existing behavior exactly.

### Mutations are Server Actions, invoked directly from the form's `onSubmit`

Same pattern as `categories.ts`: `createCard`, `updateCard`, `deleteCard` are
`'use server'` functions in `src/lib/actions/cards.ts`, each taking the
active `locale` as their last argument (Server Actions can't resolve
`getLocale()`/`getTranslations()` on their own — see
`.claude/rules/i18n.md`), returning the same
`{ success: true } | { success: false; error: string }` shape. Each ends
with `revalidatePath('/[locale]/dashboard/cards', 'page')`.

### The 50-cap counts active cards only, same mechanism as categories

`createCard` counts `prisma.card.count({ where: { userId, deactivatedAt: null } })`
and refuses at 50. The create page reads the same count to hide/disable the
"New card" action client-side as a convenience; the action re-checks
regardless.

### Ownership checks re-read from the session, never trust the client's id

`updateCard` and `deleteCard` take a card id and look the row up scoped to
`session.user.id` (`prisma.card.findFirst({ where: { id, userId } })`)
before writing. A request for someone else's card id finds nothing and the
action returns the same generic not-found error categories use.

### No translation-resolution step on the list query

Categories sort in application code with `Intl.Collator` because preset rows
need their *translated* display name resolved before sorting. Cards have no
presets and no translatable stored text — `name` is always literal, so the
list page can `orderBy: { name: "asc" }` directly in the Prisma query, with
no post-fetch resort.

### Type field is a `RadioGroup`, not a `Select`

Two fixed, mutually-exclusive, always-relevant options are better shown
both-at-once than hidden behind a dropdown click. `RadioGroup` doesn't exist
yet in `src/components/ui/` — it's added via the shadcn skill (`base-vega`
preset) in the same commit as `CardForm`.

## Data Model

No changes. For reference, the existing model:

```prisma
model Card {
  id     String @id @default(cuid())
  userId String @map("user_id")
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  name String
  type CardType

  deactivatedAt DateTime? @map("deactivated_at")

  transactions          Transaction[]
  recurringTransactions RecurringTransaction[]

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@index([userId])
  @@map("cards")
}
```

## UX Flow

- **Sidebar:** a third nav item, "Cards" (`CreditCard` icon), below
  "Categories".
- **List (`/dashboard/cards`):** shadcn `Table`. Columns: name, type,
  actions. No pagination — capped at 50 rows. Row actions: an edit link and
  a delete button that opens an `AlertDialog` before soft-deleting. Empty
  state (0 active cards) shows a short message and a "New card" call to
  action.
- **Create (`/dashboard/cards/new`):** name and type fields, 12-column grid
  (`lg:col-span-8` name + `lg:col-span-4` type radio group, one row on large
  screens). Type defaults to no selection — the user must choose (both
  options are equally likely; there is no sensible default to pre-select,
  unlike the category icon's `layout-grid`).
- **Edit (`/dashboard/cards/[id]/edit`):** same form, prefilled with the
  card's current values. Redirects to the list with a 404-equivalent if the
  id doesn't exist or isn't owned by the session user.

## Testing

- `src/lib/validations/card.spec.ts` — schema bounds (3/50 name,
  type must be `DEBIT`/`CREDIT`), key-echoing stub per
  `.claude/rules/i18n.md`.
- `src/lib/actions/cards.spec.ts` — 50-cap boundary (49 → succeeds, 50 →
  refused, a soft-deleted row doesn't count), ownership (acting on another
  user's card id no-ops), nonexistent id, soft-delete via `deactivatedAt`
  never a hard delete, locale-forwarding.
- Component tests via `renderWithIntl` for the table and the form
  (`src/components/cards/card-form.spec.tsx`, `card-row-actions.spec.tsx`).
- `e2e/cards.spec.ts` — create, edit, delete, and the 50-cap refusal, run in
  `en-US` per existing e2e convention.
