# Category Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users can create, list, edit, and soft-delete `Category` rows
through a new `/dashboard/categories` page, every new account is seeded with
11 translated preset categories at registration, and category icons are
restricted to a curated ~100-icon Lucide allow-list.

**Architecture:** Two new nullable `Category` columns (`description`,
`systemLocaleKey`). A static icon allow-list (`src/lib/category-icons.ts`)
statically imports ~113 Lucide components and is the single source of truth
both for validation and rendering. `databaseHooks.user.create.after` in
`src/lib/auth.ts` seeds the 11 presets for every new account regardless of
sign-up provider. Category mutations are `'use server'` functions in
`src/lib/actions/categories.ts`, invoked directly from client forms exactly
like `authClient` is invoked in the auth forms — no `useActionState`. Preset
rows carry literal English text plus `systemLocaleKey`;
`resolveCategoryDisplay` swaps in the translated text at read time, and the
list page sorts by that resolved text with `Intl.Collator`, not by the raw
column.

**Tech Stack:** Next.js 16.3 (Server Actions), Prisma 7.9, next-intl 4.13.5,
react-hook-form + zod 4, shadcn `base-vega` style, lucide-react ^1.28.0,
Vitest 4 + Testing Library, Playwright.

**Spec:** [2026-08-12-categories-design.md](../specs/2026-08-12-categories-design.md)

## Global Constraints

- **This is Next.js 16.3, not the Next.js in your training data.** Read
  `node_modules/next/dist/docs/01-app/02-guides/server-actions.md` and
  `.../forms.md` before writing an action. Already read for this plan; the
  pattern is: `'use server'` function, called directly from a client
  component's async handler, not necessarily bound to `<form action>`.
- **Category mutation pattern mirrors the auth forms exactly.** Look at
  `src/components/auth/register-form.tsx` before writing
  `create-category-form.tsx` — same `useForm` + `zodResolver` + `useMemo`
  schema rebuild + manual `onSubmit` shape. Do not introduce
  `useActionState` for this feature; it would be the only place in the app
  using it.
- **Every string a user can read comes from `messages/<locale>.json`.**
  Including the 11 preset names/descriptions, icon-picker search
  placeholder, empty-state copy, and every validation/error message. See
  `.claude/rules/i18n.md`. All three catalogs change in the same commit.
- **zod schema factories take a translator**, per `.claude/rules/i18n.md`
  and `.claude/rules/validation.md` — same shape as
  `src/lib/validations/auth.ts`.
- **Navigate with `@/i18n/navigation`.** Inside the dashboard shell (list →
  new, list → edit, edit → list) use a plain `Link`, not `AppLink` — each
  destination gets its own `loading.tsx` skeleton. See
  `.claude/rules/navigation-loading.md`.
- **Soft delete only.** `deactivatedAt`, never `prisma.category.delete`. See
  `.claude/rules/database.md`.
- **Re-derive identity from the session in every action.** Never trust a
  category id's ownership from client input alone —
  `findFirst({ where: { id, userId: session.user.id } })` before any write.
- **`npm test` must be green before every commit.** `npx tsc --noEmit` must
  be clean. `npm run lint` must report exactly the one pre-existing
  `src/hooks/use-mobile.ts:14` error and nothing else.
- **Every test covering new production code must be proven RED before it is
  made GREEN.** State what you saw fail and the exact message.
- **Do not run the full `npm run test:e2e`** except where a task says to —
  it truncates the test database. Run single files: `npx playwright test
  e2e/categories.spec.ts`.
- Commit messages follow `.claude/rules/commit-guideline.md`.

---

### Task 1: Schema — `description` and `systemLocaleKey`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: a new migration under `prisma/migrations/`

**Steps:**
- [ ] Add to `model Category`:
  ```prisma
  description     String?
  systemLocaleKey String? @map("system_locale_key")
  ```
  placed after `icon`, before `deactivatedAt`.
- [ ] Run `npx prisma migrate dev --name add_category_description_and_system_locale_key`
  against the local dev DB (`postgresql://postgres:postgres@localhost:5432/money-track`
  — reachable; confirmed during spec research).
- [ ] Run `npx prisma generate` (the migrate command does this automatically,
  confirm `src/generated/prisma` picked up the two new fields on
  `Category`).

---

### Task 2: The icon allow-list

**Files:**
- Create: `src/lib/category-icons.ts`
- Create: `src/lib/category-icons.spec.ts`

**Interfaces:**
- Produces: `CATEGORY_ICONS: Record<string, LucideIcon>`,
  `DEFAULT_CATEGORY_ICON = "layout-grid"`, `isCategoryIcon(value: string):
  value is keyof typeof CATEGORY_ICONS`.

- [ ] **Step 1: Write the failing test** (`category-icons.spec.ts`) —
  asserts `CATEGORY_ICONS[DEFAULT_CATEGORY_ICON]` exists, the map has 113
  entries, and every icon key from `CATEGORY_PRESETS` (Task 5) resolves.
- [ ] **Step 2: Implement.** Statically import each of the 113 icons listed
  in the spec's allow-list section, grouped by the same theme comments, and
  build the `Record`. Static imports, not `dynamicIconImports` — the spec
  rejected lazy-loading the full Lucide set. Example shape:
  ```ts
  import { House, KeyRound, Hammer /* … */ } from "lucide-react";

  export const CATEGORY_ICONS = {
    house: House,
    "key-round": KeyRound,
    hammer: Hammer,
    // …
  } as const;

  export const DEFAULT_CATEGORY_ICON = "layout-grid" satisfies keyof typeof CATEGORY_ICONS;

  export function isCategoryIcon(value: string): value is keyof typeof CATEGORY_ICONS {
    return value in CATEGORY_ICONS;
  }
  ```
- [ ] Verify the test is now green.

---

### Task 3: Message catalog additions

Moved ahead of the tasks that consume these keys (validation schema, preset
seeding, actions, sidebar, forms) — every one of them needs at least a
subset of this catalog to exist, and `src/i18n/messages.spec.ts` (which
runs as part of `npm test`) fails the moment any one of the three catalogs
is missing a key the others have. Doing this once, up front, for all three
locales, keeps `npm test` green at every later task's commit instead of
only at the end.

**Files:**
- Modify: `messages/en-US.json`, `messages/pt-BR.json`, `messages/de-DE.json`

**Keys to add** (English text below; pt-BR/de-DE need real translations,
not copies of English — write all three in this task's commit, per
`.claude/rules/i18n.md`):

- `dashboard.categoriesNavLabel` — "Categories" (this is the fixed key
  name Task 8's sidebar item consumes; don't rename it there)
- `categories.title`, `.description` (list page header)
- `categories.table.name`, `.icon`, `.description`, `.actions` (column
  headers)
- `categories.table.empty` (empty-state message), `.emptyCta`
- `categories.actions.edit`, `.delete`, `.new`
- `categories.deleteDialog.title`, `.description`, `.confirm`, `.cancel`
- `categories.form.nameLabel`, `.namePlaceholder`, `.descriptionLabel`,
  `.descriptionPlaceholder`, `.iconLabel`, `.chooseIcon`, `.submitCreate`,
  `.submitCreating`, `.submitEdit`, `.submitSaving`
- `categories.iconPicker.title`, `.searchPlaceholder`, `.noResults`
- `categories.limitReached` (the 50-cap refusal message)
- `categories.notFound` (edit page, id not owned/doesn't exist)
- `categories.presets.housing.name` / `.description`, and the same pair for
  `utilities`, `food`, `transportation`, `healthAndPersonalCare`,
  `shopping`, `entertainment`, `travel`, `education`, `giftsAndDonations`,
  `savingsAndInvestments` — English text is in the spec's preset table.
- `validation.categories.name.tooShort` / `.tooLong`,
  `validation.categories.description.tooLong`,
  `validation.categories.icon.invalid`

- [ ] Add all keys to `en-US.json`, then translate into `pt-BR.json` and
  `de-DE.json` in the same commit. Endonym rule from `.claude/rules/i18n.md`
  doesn't apply here (that's locale *names* only) — translate normally.
- [ ] `npx vitest run src/i18n/messages.spec.ts` green (asserts identical
  key sets and no empty strings across all three).

---

### Task 4: Category validation schema

**Files:**
- Create: `src/lib/validations/category.ts`
- Create: `src/lib/validations/category.spec.ts`

**Interfaces:**
- Consumes: `isCategoryIcon` from Task 2; `validation.categories.*` keys
  from Task 3.
- Produces: `createCategorySchema(t)`, `MIN_CATEGORY_NAME_LENGTH = 3`,
  `MAX_CATEGORY_NAME_LENGTH = 50`, `MAX_CATEGORY_DESCRIPTION_LENGTH = 255`,
  `export type CategoryValues = z.infer<ReturnType<typeof createCategorySchema>>`.

- [ ] **Step 1: Write the failing test**, key-echoing stub per
  `.claude/rules/i18n.md`'s testing section (see `auth.spec.ts` for the
  pattern) — covers: name boundaries at 2/3 and 50/51 chars, description at
  255/256, description omitted vs. empty string (decide: empty string
  normalizes to `undefined` via `.transform`, so a cleared description
  persists as `null` in the DB, not `""`), icon rejected when not in
  `CATEGORY_ICONS`, icon accepted for every value in the allow-list.
- [ ] **Step 2: Implement** the factory:
  ```ts
  export function createCategorySchema(t: CategoryValidationTranslator) {
    return z.object({
      name: z.string().trim()
        .min(MIN_CATEGORY_NAME_LENGTH, t("name.tooShort", { min: MIN_CATEGORY_NAME_LENGTH }))
        .max(MAX_CATEGORY_NAME_LENGTH, t("name.tooLong", { max: MAX_CATEGORY_NAME_LENGTH })),
      icon: z.string().refine(isCategoryIcon, t("icon.invalid")),
      description: z.string().trim()
        .max(MAX_CATEGORY_DESCRIPTION_LENGTH, t("description.tooLong", { max: MAX_CATEGORY_DESCRIPTION_LENGTH }))
        .transform((v) => (v === "" ? undefined : v))
        .optional(),
    });
  }
  ```
- [ ] `npm test -- category` green.

---

### Task 5: Preset data and seeding

**No vitest spec in this repo touches the real database.** Confirmed by
grep: only `src/lib/auth.ts` imports `@/lib/prisma`; every other Prisma
usage in `src/` is production code. `vitest.config.mts` runs under
`jsdom` with no database setup/teardown and no reference to
`DATABASE_URL_TEST` — that variable is Playwright's alone
(`.claude/rules/...` and the Global Constraints note e2e uses a
truncatable test database; unit tests never do). So this task's unit test
covers the **pure data-shaping logic** only — it must not call
`auth.api.signUpEmail` or otherwise touch Postgres. The actual "registering
a user creates 11 rows in the database" assertion belongs to Task 12
(`e2e/categories.spec.ts`), which already runs against the real,
Playwright-managed test database — add it there, not here.

**Files:**
- Create: `src/lib/category-presets.ts`
- Create: `src/lib/category-presets.spec.ts`
- Modify: `src/lib/auth.ts`

**Interfaces:**
- Produces (`category-presets.ts`):
  ```ts
  export const CATEGORY_PRESETS = [
    { key: "housing", icon: "house" },
    { key: "utilities", icon: "zap" },
    { key: "food", icon: "utensils" },
    { key: "transportation", icon: "car" },
    { key: "healthAndPersonalCare", icon: "heart-pulse" },
    { key: "shopping", icon: "shopping-bag" },
    { key: "entertainment", icon: "clapperboard" },
    { key: "travel", icon: "plane" },
    { key: "education", icon: "graduation-cap" },
    { key: "giftsAndDonations", icon: "gift" },
    { key: "savingsAndInvestments", icon: "piggy-bank" },
  ] as const;
  export type CategoryPresetKey = (typeof CATEGORY_PRESETS)[number]["key"];

  // Pure — no Prisma import, no I/O. Builds exactly the row shape
  // `prisma.category.createMany`'s `data` array needs, so it's testable
  // without a database and reusable from the databaseHooks callback.
  export function buildPresetCategoriesData(userId: string) {
    return CATEGORY_PRESETS.map(({ key, icon }) => ({
      userId,
      icon,
      systemLocaleKey: key,
      name: enUS.categories.presets[key].name,
      description: enUS.categories.presets[key].description,
    }));
  }
  ```
  Import `enUS` from `../../messages/en-US.json` the same way
  `auth.server.ts` already does.

- [ ] **Step 1: Write the failing test** (`category-presets.spec.ts`,
  no database) — `buildPresetCategoriesData("some-user-id")` returns
  exactly 11 rows, each `userId: "some-user-id"`, each `systemLocaleKey`
  matching a distinct `CATEGORY_PRESETS` key, each `icon` matching that
  key's paired icon and present in `CATEGORY_ICONS` (Task 2), and each
  `name`/`description` equal to that key's English catalog entry
  (`messages/en-US.json`'s `categories.presets.<key>`).
- [ ] **Step 2: Implement** `category-presets.ts` per the interface above.
- [ ] **Step 3:** in `src/lib/auth.ts`, add:
  ```ts
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await prisma.category.createMany({
            data: buildPresetCategoriesData(user.id),
          });
        },
      },
    },
  },
  ```
  Note in a short comment why the literal `name`/`description` columns
  exist: they're an English fallback, not what most users will ever see —
  display resolves through `systemLocaleKey` (Task 6).
- [ ] `databaseHooks.user.create.after` fires for every provider
  (confirmed against the better-auth docs during spec research) — no
  provider-specific test is needed here; Task 12's e2e spec covers the
  live email/password flow, which is what this repo's e2e suite can
  exercise (there's no existing mocked-OAuth harness — don't build one for
  this task alone).

---

### Task 6: Resolving preset display text

**Files:**
- Create: `src/lib/category-display.ts`
- Create: `src/lib/category-display.spec.ts`

**Interfaces:**
- Consumes: a `Category` (id, name, description, systemLocaleKey), a
  translator scoped to `categories.presets`.
- Produces: `resolveCategoryDisplay(category, t): { name: string;
  description: string | null }`.

- [ ] **Step 1: Write the failing test** — a category with
  `systemLocaleKey: null` returns its own `name`/`description` verbatim; one
  with a valid preset key returns the translated pair; one with a
  (hypothetical, defensive) unrecognized key falls back to the raw columns
  rather than throwing.
- [ ] **Step 2: Implement**, validating the runtime string against
  `CATEGORY_PRESETS`' keys before indexing the translator (a `t()` call with
  an unknown key throws in next-intl — guard it).

---

### Task 7: Category Server Actions

**Files:**
- Create: `src/lib/actions/categories.ts`
- Create: `src/lib/actions/categories.spec.ts`

**Interfaces:**
- `createCategory(values: CategoryValues): Promise<ActionResult>`
- `updateCategory(id: string, values: CategoryValues): Promise<ActionResult>`
- `deleteCategory(id: string): Promise<ActionResult>`
- `ActionResult = { success: true } | { success: false; error: string }` (an
  already-translated message, matching how `authErrorMessage` hands the
  form a rendered string rather than a code — there's no client-side error
  code table for this feature, so translate server-side using
  `getTranslations`).

- [ ] **Step 1: Write failing tests** for:
  - `createCategory` refuses at 50 active categories, succeeds at 49 → 50,
    and a soft-deleted category doesn't count toward the cap.
  - `updateCategory` on another user's category id no-ops (returns a
    not-found-shaped error, makes no write).
  - `updateCategory` on a linked preset always nulls `systemLocaleKey`,
    even when the submitted values equal the resolved display values.
  - `updateCategory` on an already-unlinked category leaves
    `systemLocaleKey` null and just updates the fields.
  - `deleteCategory` sets `deactivatedAt`, doesn't hard-delete, no-ops for
    a non-owned id.
- [ ] **Step 2: Implement.** Each action: `'use server'` at file top,
  `auth.api.getSession({ headers: await headers() })` first (no session →
  generic error, mirrors the `dashboard/page.tsx` authoritative-check
  precedent), validate with `createCategorySchema(await
  getTranslations("validation.categories"))`, then the ownership/cap/unlink
  logic above, then `revalidatePath('/[locale]/dashboard/categories',
  'page')` before returning `{ success: true }`.

---

### Task 8: Sidebar nav item

**Files:**
- Modify: `src/app/[locale]/dashboard/layout.tsx`

**Steps:**
- [ ] Add a second `SidebarMenuItem` below the existing "Dashboard" one,
  using the `Tags` icon from `lucide-react`, `render={<Link
  href="/dashboard/categories" />}` (plain `Link`, matching the existing
  item — sidebar navigation is covered by each segment's own
  `loading.tsx`), label from `dashboard.categoriesNavLabel` (added in
  Task 3).
- [ ] `isActive` should reflect the actual current segment now that there
  are two items — check how `next-intl`'s `usePathname` or the existing
  `isActive` static `true` needs to become segment-aware. (Today both items
  can't be `isActive` unconditionally; use `usePathname()` from
  `@/i18n/navigation` and compare.)

---

### Task 9: Icon picker modal

**Files:**
- Add shadcn `dialog` component (not yet in the repo — use the `shadcn`
  skill to add it correctly for this project's `base-vega` style rather
  than hand-writing it).
- Create: `src/components/categories/icon-picker.tsx`
- Create: `src/components/categories/icon-picker.spec.tsx`

**Interfaces:**
- Props: `value: string`, `onChange: (icon: string) => void`.
- Internally: `Dialog` + `Input` (search, filters `Object.keys(CATEGORY_ICONS)`
  by substring, case-insensitive) + a scrollable grid of icon buttons.
  Selecting a button calls `onChange` and closes the dialog.

- [ ] **Step 1: Write the failing test** — opens the picker, types a filter
  string, asserts only matching icons render, clicking one calls `onChange`
  with that icon's key and closes the dialog.
- [ ] **Step 2: Implement**, following `renderWithIntl` conventions for the
  spec and reusing `Tooltip`/`Button` primitives already in
  `src/components/ui/`.

---

### Task 10: Category form (shared by create and edit)

**Files:**
- Create: `src/components/categories/category-form.tsx`

**Interfaces:**
- Props: `mode: "create" | "edit"`, `categoryId?: string`,
  `defaultValues: CategoryValues`.
- Same shape as `register-form.tsx`: `useForm` + `zodResolver(useMemo(...))`,
  calls `createCategory` or `updateCategory` from `onSubmit`, shows a form
  error `Alert` on failure, `router.replace('/dashboard/categories')` +
  `router.refresh()` on success (mirrors `RegisterForm`'s post-submit
  navigation).
- Renders the icon field as the current icon + a "Choose icon" button
  opening `IconPicker` (Task 9); the rest are plain `Label`/`Input`/error
  paragraph, matching `register-form.tsx` exactly.

- [ ] Component test: submitting valid values calls the right action;
  server-side error surfaces in the `Alert`; client-side zod errors block
  submission before the action is called.

---

### Task 11: Category pages and their loading skeletons

**Files:**
- Create: `src/app/[locale]/dashboard/categories/page.tsx`
- Create: `src/app/[locale]/dashboard/categories/loading.tsx`
- Create: `src/app/[locale]/dashboard/categories/new/page.tsx`
- Create: `src/app/[locale]/dashboard/categories/new/loading.tsx`
- Create: `src/app/[locale]/dashboard/categories/[id]/edit/page.tsx`
- Create: `src/app/[locale]/dashboard/categories/[id]/edit/loading.tsx`
- Add shadcn `table` component (via the `shadcn` skill).

**`page.tsx` (list):**
- Authoritative session check (`auth.api.getSession`), same shape as
  `dashboard/page.tsx`.
- `prisma.category.findMany({ where: { userId, deactivatedAt: null } })`.
- Resolve each row with `resolveCategoryDisplay` (Task 6), sort with
  `Intl.Collator(locale)` per the spec's ordering decision.
- Render the shadcn `Table`, an empty state if zero rows, a "New category"
  link (hidden/disabled if already at 50 active — read the count the same
  way `createCategory` does, or pass `count === 50` down), and per-row
  edit `Link` + delete control (`AlertDialog` wrapping a small client
  component that calls `deleteCategory` with local pending state — this is
  in-place async work per `.claude/rules/navigation-loading.md`'s "What
  this does not cover" section, not a navigation, so no overlay/skeleton).

**`new/page.tsx`:** renders `CategoryForm` with `mode="create"` and
`defaultValues` = empty name/description, `icon:
DEFAULT_CATEGORY_ICON`.

**`[id]/edit/page.tsx`:** loads the category scoped to the session user;
`notFound()` (or a redirect to the list with a flash message — pick
whichever the codebase already has precedent for; if neither, `notFound()`
is simplest and consistent with `src/app/[locale]/not-found.tsx` already
existing) if missing/not owned. Resolves display values via
`resolveCategoryDisplay` for the form's `defaultValues`.

**Each `loading.tsx`:** a `Skeleton`-based layout matching its own page —
table skeleton (icon/name/description/actions columns, ~5 rows) for the
list, form-field skeletons for new/edit. Follow
`dashboard/loading.tsx` as the pattern to copy, not to reuse directly (it's
shaped for the placeholder dashboard page).

- [ ] Manually verify navigation between all three pages shows the correct
  skeleton before data/JS arrives (throttle network in dev if needed), per
  `.claude/rules/navigation-loading.md`'s verification expectation.

---

### Task 12: e2e coverage

**Files:**
- Create: `e2e/categories.spec.ts`

**Steps:**
- [ ] Register a user (reuse `registerUser` from `e2e/helpers.ts`), assert
  11 preset rows appear in the table on first visit to
  `/dashboard/categories`, sorted alphabetically.
- [ ] Create a category, assert it appears, sorted correctly among the
  presets.
- [ ] Edit a preset category's name; assert the change persists and (if
  feasible within one spec run) that it no longer tracks locale — a full
  cross-locale assertion may belong in `e2e/locale.spec.ts` instead; use
  judgment and note the choice.
- [ ] Delete a category (through the `AlertDialog`), assert it disappears
  from the table but the count of *other* categories is unaffected.
- [ ] Hit the 50-cap: create up to the limit (helper loop) and assert the
  51st is refused with the expected message, and/or that the "New category"
  action is disabled/hidden at 50.
- [ ] Run only this file: `npx playwright test e2e/categories.spec.ts`. Do
  not run the full suite.

---

### Task 13: Final verification

- [ ] `npm test` green.
- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run lint` — exactly the one pre-existing error.
- [ ] `npx playwright test e2e/categories.spec.ts` green.
- [ ] Manual pass in the browser: register a fresh account, confirm 11
  categories appear translated correctly in all three locales (use the
  locale switcher), create/edit/delete a category, hit the icon picker
  search, confirm the sidebar nav item and its active state.
- [ ] Request code review per `superpowers:requesting-code-review` before
  merging, given the size of this feature.
