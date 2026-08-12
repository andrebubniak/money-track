# Locale Coercion and Locale Switcher — Design Spec

**Date:** 2026-08-10
**Status:** Approved, ready for implementation planning
**Follows:** [2026-08-09-i18n-design.md](2026-08-09-i18n-design.md)

## Overview

Two follow-ups to the i18n work, both about letting a user reach the language
they want.

1. **Coercion.** A URL whose first segment is not a locale we support should
   land on a working page in a sensible locale, not on a 404.
2. **A locale switcher.** A control in the sidebar footer, beside the sign-out
   button, that changes the active locale and remembers the choice.

The second closes the "A locale switcher UI" non-goal recorded in the previous
spec, which shipped cookie *reading* and deferred the control that writes it.

## What already works

Measured against the current branch, not assumed. Three of the cases that look
like they need code do not:

| URL | Today | Verdict |
| --- | --- | --- |
| `/en-us/dashboard` | → `/en-US/dashboard` | already correct |
| `/EN-US/dashboard` | → `/en-US/dashboard` | already correct |
| `/pt-br/login` | → `/pt-BR/login` | already correct |
| `/abc/dashboard` | → `/en-US/abc/dashboard` → 404 | **to fix** |
| `/fr/dashboard` | → `/en-US/fr/dashboard` → 404 | **to fix** |
| `/en-US/nonexistent` | 404 | correct; leave alone |

next-intl matches the locale prefix case-insensitively — `getPathnameMatch` in
`middleware/utils.js` returns `exact: false` for a casing mismatch, and
`middleware.js` redirects to the canonically-cased prefix. Case correction
therefore needs **no production code**, only tests that pin the behaviour so a
next-intl upgrade cannot drop it silently.

Also already true, and relied on below: with a `NEXT_LOCALE=de-DE` cookie,
`/abc/dashboard` already resolves its *target* locale as `de-DE`. The fix does
not need to reimplement the cookie → `Accept-Language` → default chain. It only
needs to stop the bad segment being carried along.

## Goals

- An unsupported first path segment that looks like a language tag is dropped,
  and the request is redirected to the same path under the resolved locale.
- The resolved locale follows the existing order: `NEXT_LOCALE` cookie →
  `Accept-Language` → `en-US`.
- Case-insensitive locale matching stays working, under test.
- A locale switcher in the app shell writes the choice to `NEXT_LOCALE` and
  navigates to the current page in the new locale.
- The switcher's options are derived from `routing.locales`. Adding a locale
  there requires no edit to the switcher.

## Non-Goals

- **A switcher on signed-out pages.** `Accept-Language` negotiation already
  gives a first-time visitor their language, and the cookie survives sign-out.
  Deliberate, per the placement decision.
- **Language-only coercion.** `/de` does *not* become `/de-DE`. Only a casing
  mismatch is corrected; everything else falls back. This avoids inventing a
  language→region mapping, which would have to guess that a future `/pt` means
  `pt-BR` rather than `pt-PT`.
- **Any change to how `/en-US/nonexistent` behaves.** Only the locale segment
  is coerced. A valid locale with an unknown route still 404s.
- **Number, date, and currency formatting.** Unchanged from the previous spec.

## Decisions

### Distinguishing a broken locale from an app route

This is the whole problem. `/dashboard` also has an unrecognised first segment,
and it must be *prefixed*, not stripped. Middleware has no filesystem access,
so it cannot ask whether a segment is a real route.

**Chosen: a language-tag shape test.** Strip the first segment when it matches
`/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i` and is not a supported locale.

Rejected alternatives:

- **A known-route allowlist** (`["login", "register", "dashboard"]`). No regex
  guesswork, but every new route must be added to it or that route silently
  becomes unreachable. The failure mode is strictly worse, and the list cannot
  be derived at edge runtime.
- **Handling it at the 404.** The app router gives `not-found.tsx` no reliable
  read of the original pathname, and the wrong URL would stay in the address
  bar until after a 200 response.

The shape test's weakness is a future two- or three-letter route — `/faq` would
be swallowed. That is closed by a guard test (below) that fails in CI. The
allowlist's weakness would be caught by a user.

### Where the coercion runs

`src/proxy.ts`, before delegating to next-intl. On a hit it rebuilds the request
URL without the bad segment and hands that to `handleLocaleRouting`, so
**next-intl issues the redirect** and applies its own locale resolution. No
fallback logic is duplicated.

The strip function returns `null` when there is nothing to do, so the common
path — every well-formed request — is a single predicate call and an early
return. Two cases it must leave alone, both of which the regex already
excludes because it requires two to three leading letters:

- `/`, whose first segment is empty.
- `/en-US/...`, a supported locale, checked case-insensitively before the shape
  test so `/EN-US` is corrected by next-intl rather than stripped by us.

**The query string must survive the rebuild.** next-intl composes its redirect
from `request.nextUrl.search`, so the reconstructed request has to carry the
original search params or `/abc/dashboard?tab=x` would silently lose them.
This is asserted, not assumed — see the testing table.

`splitLocale` and the auth gate are untouched. The gate still runs on the clean
URL after the browser follows the redirect, so:

- `/abc/dashboard` signed in → dashboard at `/en-US/dashboard`
- `/abc/dashboard` signed out → `/en-US/login`, via the pre-existing gate

The second is not a behaviour of this change; it is the gate doing its job on a
now-valid path.

The `hasLocale`/`notFound` guard in `src/app/[locale]/layout.tsx` stays as
defence for requests the proxy matcher skips. Its comment currently describes
`/fr/dashboard` being prefixed rather than coerced, which this change makes
false; it must be corrected in the same commit.

### Switcher behaviour

`router.replace(pathname, { locale })` from `@/i18n/navigation`, where
`pathname` comes from next-intl's `usePathname()` and is already locale-free.

The cookie needs no code of ours. `createNavigation`'s router calls
`syncLocaleCookie`, which writes `document.cookie` on a locale switch; and
`syncCookie` in the middleware ignores non-`document` requests, so a prefetch
or revalidation cannot clobber a fresh choice.

**`useTransition`, with the trigger disabled while pending.** Planning
briefly reversed this, reasoning that `src/app/[locale]/dashboard/loading.tsx`
would already cover a locale switch the way a `loading.tsx` covers navigation
inside the shell per `.claude/rules/navigation-loading.md`. That reasoning was
wrong: a `loading.tsx` only wraps its own segment's children, and a locale
switch changes the `[locale]` segment itself — `dashboard/loading.tsx` is
nested *inside* `[locale]`, not above it, and `src/app/` has no `loading.tsx`
of its own. So no route-level Suspense fallback is guaranteed to cover the
click, and without local pending state it could produce no visible response at
all while the new page is fetched and the session re-read. The final review
caught this and restored `useTransition`.

`disabled={pending}` is knowingly not unit-tested: with the router mocked, a
`startTransition` around a synchronous call resolves before any assertion can
observe it. This branch has already produced eight findings shaped like an
assertion that cannot fail; a test that could not fail either way is not
worth writing here — verify it by hand instead.

A full-screen overlay remains wrong here regardless; it would blank the
sidebar.

Note for later: a dynamic route would need `params` passed alongside
`pathname`. Every current route is static, so it is omitted rather than
speculatively wired.

### Locale names are endonyms

Catalog keys `nav.localeSwitcher.locales.<tag>`, with **identical values in all
three files**:

```json
"en-US": "English",
"pt-BR": "Português (Brasil)",
"de-DE": "Deutsch"
```

Someone hunting for their own language scans for "Português", not for
"Portuguese". Only `nav.localeSwitcher.label` ("Language" / "Idioma" /
"Sprache") differs per catalog.

`Intl.DisplayNames` would produce these without catalog entries, but its output
varies by ICU version across runtimes — an untestable string in three
languages. Explicit keys are worth the duplication.

Because the component reads `t(\`locales.${locale}\`)` with `locale` typed as
the union from `routing.locales`, adding a locale to `routing.locales` without
adding its catalog key is a **compile** error, not a runtime one.

### Control and placement

shadcn `dropdown-menu` with a `DropdownMenuRadioGroup`, in `SidebarFooter`
above `SignOutButton`.

The trigger mirrors `SignOutButton` exactly — ghost variant, `size="sm"`,
`w-full justify-start`, a leading icon, and a label that goes `sr-only` when
the rail collapses to icons. They sit adjacent; any divergence in styling reads
as a bug. The `sr-only` rather than `hidden` treatment is load-bearing:
`display: none` would strip the control's accessible name once collapsed.

A `Select` was rejected — a bordered form field beside a ghost button, with a
trigger that has nowhere to render in a 32px rail.

## Components

| File | Responsibility |
| --- | --- |
| `src/i18n/locale-segment.ts` | The shape predicate and the strip function. Pure, no Next imports. |
| `src/proxy.ts` | Calls the strip function before delegating. |
| `src/components/nav/locale-switcher.tsx` | The control. Client component. |
| `src/components/ui/dropdown-menu.tsx` | Added via shadcn. |
| `messages/*.json` | `nav.localeSwitcher.label`, `nav.localeSwitcher.locales.*`. |
| `src/app/[locale]/dashboard/layout.tsx` | Mounts the switcher; footer gains a second `SidebarMenuItem`. |

The coercion logic lives in its own module rather than inside `src/proxy.ts` so
the guard test can import the regex, and so the predicate is testable without
constructing a `NextRequest`.

## Testing

Each test is specified by **what it forbids**. The i18n branch produced eight
separate findings that were assertions unable to fail, so a test whose
production code could be deleted while it stays green does not count as
coverage here.

| Test | What deleting/breaking must fail it |
| --- | --- |
| `src/i18n/locale-segment.spec.ts` | Regex bounds: `dashboard`, `login`, `register` must **not** match; `abc`, `fr`, `ja-JP`, `en`, `zh-Hans-CN` must. Both directions asserted. |
| route-collision guard, same file | Walks `src/app/[locale]/`, expanding route groups such as `(auth)`, and asserts no top-level route segment matches the regex. Fails the day someone adds `/faq`. |
| `src/proxy.spec.ts` | `/abc/dashboard` → `/en-US/dashboard`. With a `NEXT_LOCALE=de-DE` cookie → `/de-DE/dashboard`, so the target locale cannot be hardcoded. `/dashboard` still → `/en-US/dashboard` (prefixed, not stripped) — the assertion that the strip is not applied indiscriminately. `/en-US/nonexistent` returns no redirect, leaving the 404 to the router. |
| `src/proxy.spec.ts`, query | `/abc/dashboard?tab=x` → `/en-US/dashboard?tab=x`. Dropping the search params during the rebuild must fail. |
| `src/proxy.spec.ts`, casing | `/en-us/dashboard`, `/EN-US/dashboard`, `/pt-br/login` redirect to canonical casing. Pins next-intl behaviour against an upgrade. |
| `src/components/nav/locale-switcher.spec.tsx` | `replace` called with exactly `("/dashboard", { locale: "de-DE" })` against a mocked `usePathname` — hardcoding either argument fails. |
| same | One item per entry in `routing.locales`, driven by the array rather than a literal count; the active locale is the checked item. |
| `e2e/locale.spec.ts` | `/abc/dashboard` signed in renders the dashboard at `/en-US/dashboard`. Signed out, it reaches `/en-US/login`. |
| same | A sidebar switch changes the URL **and** the rendered copy **and** survives a reload — the third clause is what proves the cookie was written. |

Existing constraints carry over unchanged: `src/i18n/messages.spec.ts` will
assert the new keys exist in all three catalogs, and e2e specs address routes
through the `path()` helper in `e2e/helpers.ts`.

## Risks

- **A future short route collides with the shape regex.** Mitigated by the
  guard test. The residual risk is someone adding a route and deleting the
  failing test rather than renaming the route; the test carries a comment
  explaining the consequence.
- **A next-intl upgrade drops case-insensitive prefix matching.** Mitigated by
  the casing tests, which is the reason to write tests for behaviour we did not
  implement.
- **`t(\`locales.${locale}\`)` may not narrow** as expected under next-intl's
  `AppConfig` augmentation. If the template literal does not resolve to a
  literal union, fall back to an explicit `Record<Locale, MessageKey>` map —
  which keeps the compile-time guarantee — rather than casting.
