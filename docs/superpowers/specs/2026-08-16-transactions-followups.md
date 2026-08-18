# Transaction Management — Known Issues and Follow-ups

**Date:** 2026-08-18
**Status:** Open, tracked after the feature merged

Recorded at the end of the transactions feature. Everything here was found by
review or end-to-end testing, judged non-blocking, and deliberately shipped
rather than rushed.

## 1. `AsyncCombobox` cannot be searched by typing once it holds a value

**Where:** `src/components/ui/async-combobox.tsx`
**Affects:** the transactions filter panel (whose default is the "All" entry)
and every edit form (which passes a `selectedOption`).

Typing into a combobox that already holds a selection reverts the input to the
selected label, discarding what was typed.

**Root cause.** `allOption` and `listItems` are rebuilt as fresh array/object
literals on every render, so `currentValue` gets a new object identity on each
keystroke. Base UI's `Combobox` root calls
`useValueChanged(selectedValue, syncInputToSelectedLabel)`, which treats that
identity change as a real value change and resyncs the input text.

**A complete fix needs two changes, not one** — verified during review:

- Memoizing `listItems`/`currentValue` alone is **not** enough: `items` gets a
  new array identity every time a fetch resolves, which retriggers the resync.
  A canonical per-id object cache (e.g. a `useRef(new Map())` returning the
  same object for the same `id`/`name`) does stop it.
- Even then the query is wrong. Base UI seeds the input with the selected label
  and the caret lands at its end, so typing produces `q=AllBrav` and an empty
  list. The input also needs clearing (or selecting) when the popup opens.

**Related symptom.** Reopening the popup refetches using the selected *label*
as the query; when the selected row is absent from the returned page, the input
renders blank while the form value is retained.

**Why it did not block.** Options paginate by infinite scroll, and categories
and cards are both capped at 50 per user, so every value stays reachable by
scrolling — nothing becomes unselectable.

**When fixing, verify against both shapes** — the filter panel's `allOptionLabel`
case and the edit forms' `selectedOption` case. They fail differently.

## 2. A soft-deleted transaction's edit page returns HTTP 200, not 404

**Where:** `src/app/[locale]/(app)/transactions/[id]/edit/page.tsx`

The page calls `notFound()` correctly and the 404 UI renders, but the status
code is 200. `loading.tsx` implicitly wraps the page in a Suspense boundary,
and streaming commits the status before `notFound()` fires.

**No data leaks** — `findFirst` returns null before anything renders, and
`e2e/transactions.spec.ts` asserts the 404 UI plus zero Amount fields. This is
not new to this feature: `cards/[id]/edit` and `categories/[id]/edit` ship a
`loading.tsx` too and behave identically. For an authenticated, non-indexed
page the status code carries no practical consequence.

## 3. Smaller items, deliberately deferred

- `src/proxy.spec.ts` has no unit test pinning `PROTECTED_PATHS`' prefix
  matching (e.g. that `/cardsomething` is *not* guarded). The middleware is
  explicitly not a security boundary — every page re-checks with
  `getSession()` — so the exposure is a wasted render, not access.
- `src/components/ui/checkbox.tsx` carries an unguarded `[&>svg]:size-3.5`,
  the specificity trap `.claude/rules/ui.md` documents. Inert today because the
  icon inside is hardcoded, but the descendant selector would genuinely beat a
  `size-6` utility if anyone parameterises it. Vendor-generated file.
- No `clampPage` test at `total === PAGE_SIZE` exactly. Behaviour is correct by
  inspection (`lastPage` is 1).
- The create-menu spec does not assert there are *only* three items.
- The transactions page's combobox-label lookups do not filter
  `deactivatedAt: null` — arguably correct, since transactions referencing a
  deactivated category still appear in the list and need a label.

## 4. Documentation drift worth a glance

- `src/app/[locale]/(app)/layout.tsx`'s header comment still says
  `dashboard/page.tsx` owns the authoritative `auth.api.getSession()` call,
  though the layout now wraps transactions, cards, and categories as well. Each
  page does its own check, so the code is correct; only the comment is stale.
- The list renders Amount as the 4th column while the design spec lists it 7th.
  This looks like a deliberate grouping of the sortable columns — confirm it
  was intended.
