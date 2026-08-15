# Category Management — Design Spec

**Date:** 2026-08-12
**Status:** Approved, ready for implementation planning

## Overview

The first real CRUD feature in the app: users manage the `Category` records
their transactions will eventually reference. Every account gets 11 built-in
categories at registration, translated at runtime; users can create, edit,
and (soft) delete categories of their own, up to 50 per account, through a
new `/dashboard/categories` page.

This is also the first feature to write to `prisma/schema.prisma` since the
initial migration, the first Server Actions in the app, and the first
non-auth form.

## Goals

- `Category` gains two columns: `description` (nullable free text) and
  `systemLocaleKey` (nullable, marks a row as a translated preset).
- Full CRUD: create, list (table), edit, soft delete.
- Every new user — email/password or Google — gets the same 11 preset
  categories, seeded once at account creation.
- A curated allow-list of Lucide icons (about a hundred, verified against the
  installed `lucide-react` version) is the only valid set of `icon` values.
  `layout-grid` is the default for a new, not-yet-customized category.
- A hard cap of 50 active categories per user, enforced server-side.
- `name`: required, 3–50 characters. `description`: optional, ≤255
  characters. Both validated with zod, client and server, per
  `.claude/rules/validation.md`.
- The categories table is unpaginated, ordered by (locale-aware, translated)
  name ascending.

## Non-Goals

- Wiring `Category` into `Transaction` create/edit forms — those don't exist
  yet either. This feature only manages the category records themselves.
- Restoring a soft-deleted category. `deactivatedAt` follows
  `.claude/rules/database.md`; there is no "trash" UI.
- Re-linking a category back to its preset translation once edited. Once
  `systemLocaleKey` is cleared it is cleared for good.
- Retroactively seeding presets for accounts that already exist. The hook
  only fires on `user.create`.
- Icon upload or a custom icon library — Lucide only, from the curated list.

## Decisions

### Presets are seeded via `databaseHooks.user.create.after`, not the
### `/sign-up/email` `before` hook

`src/lib/auth.ts` already has a `before` hook, but it is scoped to
`ctx.path === "/sign-up/email"` — it never runs for a Google sign-up, and a
`User` row is created either way. `databaseHooks.user.create.after` runs
after the row exists, for every provider, so it's the one place that reaches
both flows. Confirmed against the better-auth docs
(`/docs/concepts/database#database-hooks`).

### Preset rows store literal English text plus a `systemLocaleKey`; display
### resolves the translation at read time

`name` and `description` are still real, non-null `String` columns — a
preset row is written with its English text as a fallback and as the value
`orderBy` would see if translation resolution were ever skipped. `systemLocaleKey`
(e.g. `"housing"`) is what the display layer checks first: when set, the
table and edit-form prefill look up
`categories.presets.<systemLocaleKey>.name` / `.description` in the active
locale's catalog instead of the raw columns. See `resolveCategoryDisplay` in
the plan.

### Editing a still-linked preset clears `systemLocaleKey` unconditionally

Submitting the edit form for a category whose `systemLocaleKey` is not null
always sets it to null, storing exactly what the form submitted (in whatever
locale the user was viewing) as the new literal `name`/`description`. This
includes a resubmission with unchanged values — the rule is "the edit form
was submitted," not "a value differs," which keeps the behavior a single
unconditional branch instead of a value-by-value diff against the resolved
display text.

### Sorting happens after translation resolution, in application code

Requirement 9 orders the table by category name ascending. A raw SQL
`ORDER BY name` would sort preset rows by their **English** fallback text
even when displayed in German or Portuguese, producing a visibly wrong order
for the 11 presets in those locales. Because the table is capped at 50 rows
per user, the page resolves every row's display name first, then sorts with
`Intl.Collator(locale)` in the Server Component. Custom (non-preset) rows are
unaffected either way — their stored `name` already is the display name.

### Icons are a static, curated allow-list, not the full Lucide set

`lucide-react`'s `dynamicIconImports` covers ~1,750 icons; most have nothing
to do with an expense category. `src/lib/category-icons.ts` exports a fixed
`Record<string, LucideIcon>` of statically-imported icons (no dynamic
`import()`), grouped by theme. The `icon` column is validated against
`Object.keys(CATEGORY_ICONS)` — an icon name that isn't in the map can never
be written, so the display layer never has to handle an unknown icon.

Every name below was checked against this repo's installed `lucide-react`
(`^1.28.0`) by grepping `node_modules/lucide-react/dynamicIconImports.d.ts`
for its `lucide.dev/icons/<name>` doc comment — the file itself has no
importable icon-name list, only per-icon namespaces, so the doc-comment URL
is the reliable source of the canonical kebab-case name.

**Housing** (10): `house`, `key-round`, `hammer`, `wrench`, `building`,
`building-2`, `warehouse`, `door-open`, `bed`, `sofa`

**Utilities** (10): `zap`, `flame`, `droplet`, `wifi`, `phone`, `plug`,
`lightbulb`, `router`, `satellite-dish`, `thermometer`

**Food** (12): `utensils`, `utensils-crossed`, `coffee`, `pizza`, `apple`,
`shopping-basket`, `soup`, `cake`, `ice-cream-cone`, `wine`, `beer`,
`sandwich`

**Transportation** (11): `car`, `car-front`, `bus`, `train-front`, `fuel`,
`bike`, `plane`, `ship`, `circle-parking`, `truck`, `navigation`

**Health and personal care** (11): `heart-pulse`, `stethoscope`, `pill`,
`syringe`, `eye`, `dumbbell`, `cross`, `shield-plus`, `scissors`, `sparkles`,
`activity`

**Shopping** (8): `shopping-cart`, `shopping-bag`, `shirt`, `gem`, `watch`,
`tag`, `package`, `store`

**Entertainment** (10): `tv`, `gamepad-2`, `film`, `music`, `clapperboard`,
`ticket`, `party-popper`, `camera`, `headphones`, `book-open`

**Travel** (8): `plane-takeoff`, `luggage`, `map`, `map-pin`, `compass`,
`tent`, `tree-palm`, `globe`

**Education** (8): `graduation-cap`, `book`, `book-open-text`, `pencil`,
`backpack`, `notebook`, `ruler`, `calculator`

**Gifts and donations** (4): `gift`, `heart-handshake`, `hand-coins`,
`package-plus`

**Savings and investments** (9): `piggy-bank`, `landmark`, `trending-up`,
`wallet`, `coins`, `banknote`, `chart-line`, `percent`, `circle-dollar-sign`

**General / other** (12), for custom categories outside the 11 presets:
`layout-grid` (the default), `briefcase`, `users`, `baby`, `paw-print`,
`credit-card`, `wallet-cards`, `receipt`, `calendar`, `bell`, `smartphone`,
`printer`

Total: **113 icons.**

### The 11 presets and their icons

| # | Name | Icon | Description |
|---|---|---|---|
| 1 | Housing | `house` | Rent or mortgage, property taxes, maintenance, and condo fees. |
| 2 | Utilities | `zap` | Electricity, water, gas, internet, and phone. |
| 3 | Food | `utensils` | Groceries, restaurants, takeout, and coffee. |
| 4 | Transportation | `car` | Fuel, public transit, car payments, insurance, maintenance, and parking. |
| 5 | Health and personal care | `heart-pulse` | Insurance, doctors, prescriptions, dental, vision, gym, and wellness. |
| 6 | Shopping | `shopping-bag` | Clothing, electronics, household goods, and personal items. |
| 7 | Entertainment | `clapperboard` | Streaming, games, movies, hobbies, and events. |
| 8 | Travel | `plane` | Flights, hotels, transportation, and meals. |
| 9 | Education | `graduation-cap` | Tuition, courses, books, and supplies. |
| 10 | Gifts and donations | `gift` | Gifts and charitable contributions. |
| 11 | Savings and investments | `piggy-bank` | Savings transfers, retirement contributions, investments, and dividends. |

Preset order in `CATEGORY_PRESETS` matches this table; seeded row order
doesn't matter since the table always re-sorts by display name.

### Create/Edit are dedicated pages, not modals

`/dashboard/categories/new` and `/dashboard/categories/[id]/edit`. Only the
icon picker (requirement 3) is a modal, opened from within either page. This
was chosen over dialogs-over-the-table so each form gets its own segment
`loading.tsx` skeleton per `.claude/rules/navigation-loading.md`, and so a
direct link to "edit this category" is a real, shareable-within-the-app URL.

### Mutations are Server Actions, invoked directly from the form's
### `onSubmit` — not `<form action>` / `useActionState`

Matches the existing auth forms exactly: `LoginForm` and `RegisterForm` use
`react-hook-form` + `zodResolver`, then call an async function from
`onSubmit` and read its result. `createCategory` / `updateCategory` /
`deleteCategory` are `'use server'` functions called the same way — a
category form is a client component calling a typed async function, not a
raw `FormData` handler. This keeps one mutation pattern across the app
instead of introducing a second (`useActionState`) alongside it.

`revalidatePath('/[locale]/dashboard/categories', 'page')` runs inside each
action before returning — the dynamic-segment form of the path revalidates
the route for all three locales in one call, matching the Server Actions
guide's `revalidatePath('/posts')` pattern.

### The 50-cap counts active categories only

Deleting (soft-deleting) a category frees a slot. `createCategory` counts
`prisma.category.count({ where: { userId, deactivatedAt: null } })` and
refuses at 50. The create page also reads this count to hide/disable the
"New category" action client-side — a convenience, not the enforcement; the
action re-checks regardless, the same defense-in-depth shape as the
client+server auth validation.

### Ownership checks re-read from the session, never trust the client's id

Per the Server Actions guide's own security section: `updateCategory` and
`deleteCategory` take a category id and the changed fields, then look the
row up scoped to `session.user.id` — `prisma.category.findFirst({ where: {
id, userId } })` — before writing. A request for someone else's category id
finds nothing and the action returns a generic not-found result, the same
shape as a real 404.

## Data Model

```prisma
model Category {
  id     String @id @default(cuid())
  userId String @map("user_id")
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  name            String
  icon            String
  description     String?
  systemLocaleKey String? @map("system_locale_key")

  deactivatedAt DateTime? @map("deactivated_at")

  transactions          Transaction[]
  recurringTransactions RecurringTransaction[]

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@index([userId])
  @@map("categories")
}
```

Only `description` and `systemLocaleKey` are new; everything else already
exists. No `@db.VarChar` on the new columns — `.claude/rules/database.md`
doesn't call for database-level string bounds, and the existing
`Transaction.description` follows the same plain-`String` precedent. The
50/255 limits from requirement 8 are enforced in the zod schema only, both
client- and server-side.

## UX Flow

- **Sidebar:** a second nav item, "Categories" (`Tags` icon), below
  "Dashboard".
- **List (`/dashboard/categories`):** shadcn `Table`. Columns: icon, name,
  description, row actions. No pagination — capped at 50 rows. Row actions:
  an edit link and a delete button that opens an `AlertDialog` (already in
  the codebase) before soft-deleting. Empty state (0 active categories, an
  edge case since every account seeds 11) shows a short message and a "New
  category" call to action.
- **Create (`/dashboard/categories/new`):** name, description, icon fields.
  Icon field renders the currently selected icon plus a "Choose icon" button
  that opens the picker modal; the field starts on `layout-grid`.
- **Edit (`/dashboard/categories/[id]/edit`):** same form, prefilled with
  the *resolved* (translated, if still linked) values. Redirects to the list
  with a 404-equivalent if the id doesn't exist or isn't owned by the
  session user.
- **Icon picker (modal):** a search `Input` filtering a scrollable grid of
  the 113 icon buttons by name; selecting one closes the modal and sets the
  form field.

## Testing

- `src/lib/validations/category.spec.ts` — schema bounds (3/50 name,
  ≤255 description, icon must be in the allow-list), key-echoing stub per
  `.claude/rules/i18n.md`.
- `src/lib/category-icons.spec.ts` — every preset's `icon` is a key in
  `CATEGORY_ICONS`; `layout-grid` is present.
- Server Action tests — 50-cap boundary (49 → succeeds, 50 → refused, a
  soft-deleted row doesn't count), ownership (acting on another user's
  category id no-ops), unlink-on-edit (a linked preset loses
  `systemLocaleKey` after any update).
- Seeding test — registering a user (email and, where feasible, mocked
  Google) creates exactly 11 categories with the expected icons and
  `systemLocaleKey`s.
- Component tests via `renderWithIntl` for the table (translated preset
  names render correctly per locale) and the forms.
- `e2e/categories.spec.ts` — create, edit (including the unlink-on-edit
  behavior visibly), delete, and the 50-cap refusal, run in `en-US` per
  existing e2e convention.
