# Database Guideline

Conventions already established in `prisma/schema.prisma`. Follow these when
adding or changing a model; they are not enforced by tooling, only by
consistency with what is already there.

## Ids are `cuid()`, always

```prisma
id String @id @default(cuid())
```

Every model, including the Better Auth ones, uses a `String` primary key
defaulted to `cuid()`. Never an autoincrementing `Int`, never a
client-supplied id.

## Columns and tables are `snake_case` in the database, `camelCase` in Prisma

Every multi-word field gets `@map("snake_case_name")`; every model gets
`@@map("snake_case_plural")` on the table itself. The Prisma schema reads as
normal TypeScript-ish camelCase; the SQL underneath reads as normal Postgres
snake_case. Neither side compromises for the other.

```prisma
model ExpensePlanItem {
  expensePlanId String @map("expense_plan_id")
  // ...
  @@map("expense_plan_items")
}
```

## Every foreign key gets an `@@index`

```prisma
userId String @map("user_id")
user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

@@index([userId])
```

Applies to every FK column on every model, without exception. A composite
index is added on top when a query pattern needs one —
`@@index([userId, date])` on `Transaction` for the dashboard's date-range
queries is the existing example, not a replacement for the plain `@@index([userId])`.

## `onDelete` reflects ownership, not just convenience

- **`Cascade`** — the child cannot outlive the parent: every `userId`
  relation, and `ExpensePlanItem.parentItemId` (a sub-item cannot outlive its
  parent item).
- **`Restrict`** — the referenced row is a shared reference another row
  points at, not something owned by the pointing row: `Transaction.categoryId`,
  `Transaction.cardId`, `RecurringTransaction.categoryId/cardId`. Deleting a
  `Category` or `Card` that transactions still reference must fail, not
  silently orphan them.
- **`SetNull`** — the reference is informational and fine to lose:
  `Transaction.recurringTransactionId` clears if the `RecurringTransaction`
  that generated it is removed; the generated transaction itself stays.

Pick based on which of these three the new relation actually is, not by
copying whichever is closest in the file.

## Soft delete via `deactivatedAt`, not row deletion

`Category`, `Card`, `Transaction`, `RecurringTransaction`, `ExpensePlan`, and
`ExpensePlanItem` all carry:

```prisma
deactivatedAt DateTime? @map("deactivated_at")
```

`null` means active. These rows are financial history — a user "deleting" a
category or card must not delete the transactions that reference it, so the
row is marked inactive and kept. Add this field to a new model if its rows are
user-created records with the same lifecycle; the Better Auth models
(`Session`, `Account`, `Verification`) and `User` itself don't have it and
shouldn't — their deletion semantics belong to better-auth, not this pattern.

## `createdAt` / `updatedAt` on every model

```prisma
createdAt DateTime @default(now()) @map("created_at")
updatedAt DateTime @updatedAt @map("updated_at")
```

No exceptions in the current schema, including the Better Auth tables.

## Constrained value sets are enums, not strings

`CardType`, `TransactionType`, `RecurringFrequency`, `ExpensePlanStatus`,
`NumberFormat`, and `DateFormat` are all Prisma `enum`s. A field whose valid
values are a fixed, known set at schema-design time — not user-authored text
— is an enum, so Postgres rejects an invalid value at the database level and
the generated client types it as a union instead of `string`. `Category.icon`
is the deliberate exception: the set of icons is a frontend/design concern
that changes independently of the schema, so it stays a plain `String`.

## Money is `Decimal(12, 2)`, never `Float`

```prisma
amount Decimal @db.Decimal(12, 2)
```

Floating point cannot represent currency amounts exactly. Every monetary
column (`Transaction.amount`, `RecurringTransaction.amount`,
`ExpensePlanItem.plannedAmount`) uses `Decimal` with an explicit precision and
scale.

## The Better Auth models are library-owned

`Session`, `Account`, and `Verification` (grouped under the `// Better Auth`
comment at the bottom of the schema) exist to satisfy better-auth's expected
shape. Field mapping (`@map`/`@@map`) and FK indexing still follow the
conventions above, but don't add app-specific constraints — soft delete,
value-set enums, bounded lengths — to their fields without checking
`node_modules/better-auth/dist` first. Their format and lifecycle are the
library's contract, not ours to redesign.

## Non-obvious invariants get a comment, not a constraint

Some rules in the current schema aren't expressible in Prisma and are
documented inline instead of silently relied upon — e.g. `Transaction.cardId`
being `null` exactly when `type` is `INCOME`, or
`RecurringTransaction.nextRunDate` only ever being set for indefinite
(no fixed occurrence count) recurrences. When a new field has a rule like
this — true only in combination with another field, and not something a
`@db` attribute or `enum` can enforce — write the comment at the field, the
way the existing ones do, rather than leaving it to be rediscovered.
