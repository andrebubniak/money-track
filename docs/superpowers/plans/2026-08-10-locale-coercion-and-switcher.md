# Locale Coercion and Locale Switcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A URL with an unsupported locale segment lands on a working page instead of a 404, and a control in the sidebar footer lets a signed-in user change language.

**Architecture:** `src/proxy.ts` strips a leading segment that is shaped like a language tag but is not one of ours, then hands the shortened path to next-intl, which resolves the locale from its existing cookie → `Accept-Language` → default chain and issues the redirect. The switcher is a Base UI dropdown in `SidebarFooter` that calls `router.replace(pathname, { locale })` from `@/i18n/navigation`; next-intl's client router writes the `NEXT_LOCALE` cookie itself.

**Tech Stack:** Next.js 16.3, next-intl 4.13.5, Base UI (`@base-ui/react`), shadcn `base-vega` style, Vitest 4 + Testing Library, Playwright.

**Spec:** [2026-08-10-locale-coercion-and-switcher-design.md](../specs/2026-08-10-locale-coercion-and-switcher-design.md)

## Global Constraints

- **This is Base UI, not Radix.** Components take a `render` prop, not `asChild`. Check `node_modules/@base-ui/react/**/*.d.ts` before assuming an API.
- **This is Next.js 16.3.** Read `node_modules/next/dist/docs/` before writing framework code. Middleware lives in `src/proxy.ts` and exports `proxy`, not `middleware`.
- **Never write a user-readable string in a component.** Copy lives in `messages/<locale>.json`. This includes `aria-label` and `sr-only` text. See `.claude/rules/i18n.md`.
- **All three catalogs change in the same commit** — `messages/en-US.json`, `messages/pt-BR.json`, `messages/de-DE.json`. TypeScript checks only en-US; `src/i18n/messages.spec.ts` catches the other two.
- **Navigate with `@/i18n/navigation`**, never `next/link` or `next/navigation`.
- **`npm test` must be green before every commit.** `npx tsc --noEmit` must be clean.
- **`npm run lint` must report exactly one error** — the pre-existing `src/hooks/use-mobile.ts:14` `react-hooks/set-state-in-effect`, deliberately out of scope (commit `e560d7e`). Any second error is yours.
- **Every test must be proven RED before it is made GREEN.** State in your report what you saw fail and the exact message.
- **Ask of every test: "what single line of production code could I delete and still pass?"** The preceding i18n branch produced eight findings that were all assertions unable to fail. A test that survives deleting the code it covers is not coverage.
- **Do not run the full `npm run test:e2e` except where a task says to.** It truncates every table in the test database. Run single spec files with `npx playwright test e2e/<file>`.
- Commit messages follow `.claude/rules/commit-guideline.md`: `<type>(<subject>): <imperative description>`, no trailing period.

---

### Task 1: The unknown-locale segment helper

A pure module with no Next.js imports, so it is testable without constructing a `NextRequest` and so the guard test can import the predicate.

**Files:**
- Create: `src/i18n/locale-segment.ts`
- Create: `src/i18n/locale-segment.spec.ts`

**Interfaces:**
- Consumes: `routing` from `src/i18n/routing.ts` — `routing.locales` is `readonly ["en-US", "pt-BR", "de-DE"]`.
- Produces:
  - `isLocaleShaped(segment: string): boolean`
  - `stripUnknownLocale(pathname: string): string | null` — returns the pathname with a bogus leading language tag removed, or `null` when the path must be left alone.

- [ ] **Step 1: Write the failing test**

Create `src/i18n/locale-segment.spec.ts`:

```ts
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { isLocaleShaped, stripUnknownLocale } from "@/i18n/locale-segment";

describe("isLocaleShaped", () => {
  // Both directions are asserted. A regex that matched everything would pass
  // the first block alone; one that matched nothing would pass the second.
  it.each(["en", "de", "abc", "fr", "pt-BR", "en-us", "ja-JP", "zh-Hans-CN"])(
    "%s is shaped like a language tag",
    (segment) => {
      expect(isLocaleShaped(segment)).toBe(true);
    },
  );

  it.each(["dashboard", "login", "register", "", "a", "settings", "some-page"])(
    "%s is not shaped like a language tag",
    (segment) => {
      expect(isLocaleShaped(segment)).toBe(false);
    },
  );
});

describe("stripUnknownLocale", () => {
  it.each([
    ["/abc/dashboard", "/dashboard"],
    ["/fr/dashboard", "/dashboard"],
    ["/de/dashboard", "/dashboard"],
    ["/ja-JP/login", "/login"],
    ["/abc", "/"],
    ["/abc/de-DE/dashboard", "/de-DE/dashboard"],
  ])("strips %s to %s", (pathname, expected) => {
    expect(stripUnknownLocale(pathname)).toBe(expected);
  });

  it.each([
    "/",
    "/dashboard",
    "/login",
    "/en-US/dashboard",
    "/pt-BR/login",
    "/de-DE/dashboard",
  ])("leaves %s alone", (pathname) => {
    expect(stripUnknownLocale(pathname)).toBeNull();
  });

  it.each(["/en-us/dashboard", "/EN-US/dashboard", "/pt-br/login"])(
    "leaves the mis-cased but supported %s alone",
    (pathname) => {
      // next-intl redirects these to the canonical casing itself. Stripping
      // them here would replace that correction with a fallback locale.
      expect(stripUnknownLocale(pathname)).toBeNull();
    },
  );
});

/**
 * Reads the top-level URL segments the app actually serves, expanding route
 * groups such as `(auth)`, which contribute no segment of their own.
 */
function topLevelRouteSegments(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) =>
      entry.name.startsWith("(") && entry.name.endsWith(")")
        ? topLevelRouteSegments(join(dir, entry.name))
        : [entry.name],
    );
}

describe("route collision guard", () => {
  const segments = topLevelRouteSegments(join(process.cwd(), "src/app/[locale]"));

  it("actually found the routes", () => {
    // Without this, a wrong path would make the guard below pass on an empty
    // list — the assertion would be structurally incapable of failing.
    expect(segments).toEqual(
      expect.arrayContaining(["dashboard", "login", "register"]),
    );
  });

  it.each(segments)(
    "route segment %s is not mistaken for a language tag",
    (segment) => {
      // If this fails, RENAME THE ROUTE. Do not widen the regex in
      // locale-segment.ts — that would stop `/de` and `/fr` being coerced,
      // which is the whole point of the module.
      expect(isLocaleShaped(segment)).toBe(false);
    },
  );
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/i18n/locale-segment.spec.ts`
Expected: FAIL — `Failed to resolve import "@/i18n/locale-segment"`.

- [ ] **Step 3: Write the implementation**

Create `src/i18n/locale-segment.ts`:

```ts
import { routing } from "./routing";

/**
 * A path segment shaped like a BCP 47 language tag: two or three letters,
 * optionally followed by `-` subtags. Matches `en`, `abc`, `pt-BR`,
 * `zh-Hans-CN`. Does not match `dashboard`, `login`, `register`.
 *
 * This is a shape test, not a validity test. `abc` is not a real language and
 * that is deliberate: someone hand-editing the locale in the URL should land
 * somewhere useful rather than on a 404.
 *
 * The cost is that a top-level route named with two or three letters — `/faq`
 * — would be swallowed. `locale-segment.spec.ts` walks `src/app/[locale]/` and
 * fails the day one is added, so this cannot break silently.
 */
const LOCALE_SHAPED = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i;

export function isLocaleShaped(segment: string): boolean {
  return LOCALE_SHAPED.test(segment);
}

/**
 * Removes a leading segment that looks like a language tag but is not one of
 * ours, so `/abc/dashboard` becomes `/dashboard`. Returns `null` when the path
 * should be left untouched, which is every well-formed request.
 *
 * Supported locales are matched case-insensitively and left in place on
 * purpose: next-intl already redirects `/en-us/…` to the canonical `/en-US/…`,
 * and stripping it here would replace that correction with a fallback.
 */
export function stripUnknownLocale(pathname: string): string | null {
  const [, first, ...rest] = pathname.split("/");

  if (!first || !isLocaleShaped(first)) return null;

  const isSupported = routing.locales.some(
    (locale) => locale.toLowerCase() === first.toLowerCase(),
  );
  if (isSupported) return null;

  return `/${rest.join("/")}`;
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx vitest run src/i18n/locale-segment.spec.ts`
Expected: PASS.

- [ ] **Step 5: Prove the guard test can fail**

Temporarily add `expect(isLocaleShaped("faq")).toBe(false);` to the "actually found the routes" test and confirm it FAILS (because `faq` *is* locale-shaped, which is precisely the collision the guard exists to catch). Remove it again.

This is the only way to know the guard is wired to something real.

- [ ] **Step 6: Run the full suite and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all green, previous 103 tests plus the new ones.

- [ ] **Step 7: Commit**

```bash
git add src/i18n/locale-segment.ts src/i18n/locale-segment.spec.ts
git commit -m "feat(i18n): add the unknown-locale segment helper"
```

---

### Task 2: Coerce the unknown segment in the proxy

**Files:**
- Modify: `src/proxy.ts`
- Modify: `src/proxy.spec.ts`
- Modify: `src/app/[locale]/layout.tsx:40-43` — the comment there becomes false
- Modify: `e2e/locale.spec.ts:56-60` — that test asserts the old behaviour
- Modify: `.claude/rules/i18n.md`

**Interfaces:**
- Consumes: `stripUnknownLocale` from Task 1.
- Produces: no new exports. `proxy` and `config` keep their signatures.

**Read first:** `src/proxy.ts` in full. The auth gate below the locale handling is **not a security boundary** — it only checks that a session cookie exists, and `src/app/[locale]/dashboard/page.tsx` holds the authoritative check. Do not "improve" it.

- [ ] **Step 1: Write the failing tests**

Add to `src/proxy.spec.ts`, inside the existing `describe("locale routing", …)` block. **Delete the existing test named `"does not treat an unknown first segment as a locale"`** (currently `src/proxy.spec.ts:55-62`) — it asserts the behaviour this task removes.

```ts
    it("coerces an unknown locale segment and keeps the rest of the path", () => {
      const response = proxy(request("/abc/dashboard"));

      expect(response.headers.get("location")).toBe(
        "http://localhost:3000/en-US/dashboard",
      );
    });

    it("coerces a real-but-unsupported language tag", () => {
      const response = proxy(request("/fr/dashboard"));

      expect(response.headers.get("location")).toBe(
        "http://localhost:3000/en-US/dashboard",
      );
    });

    it("does not invent a region for a bare language subtag", () => {
      // `/de` is not coerced to `de-DE`. Only casing is corrected; everything
      // else falls back. Deliberate — see the spec's non-goals.
      const response = proxy(request("/de/dashboard"));

      expect(response.headers.get("location")).toBe(
        "http://localhost:3000/en-US/dashboard",
      );
    });

    it("resolves the replacement locale from the cookie, not a hardcoded default", () => {
      const response = proxy(
        request("/abc/dashboard", { cookie: "NEXT_LOCALE=de-DE" }),
      );

      expect(response.headers.get("location")).toBe(
        "http://localhost:3000/de-DE/dashboard",
      );
    });

    it("preserves the query string while coercing", () => {
      const response = proxy(request("/abc/dashboard?tab=x&y=2"));

      expect(response.headers.get("location")).toBe(
        "http://localhost:3000/en-US/dashboard?tab=x&y=2",
      );
    });

    it("redirects a coerced path that already carried a valid locale", () => {
      // `/abc/de-DE/x` strips to `/de-DE/x`, which next-intl considers
      // correct and does not redirect. Without a redirect of our own the
      // browser would sit on the bogus URL.
      const response = proxy(request("/abc/de-DE/login"));

      expect(response.headers.get("location")).toBe(
        "http://localhost:3000/de-DE/login",
      );
    });

    it("carries the locale cookie onto that redirect", () => {
      // next-intl sets NEXT_LOCALE on the response it returns for
      // `/de-DE/login`; issuing a bare redirect would throw it away and force
      // renegotiation on the next request.
      const response = proxy(request("/abc/de-DE/login"));

      expect(response.cookies.get("NEXT_LOCALE")?.value).toBe("de-DE");
    });

    it("still prefixes an unprefixed path rather than stripping it", () => {
      // The guard against over-eager stripping: `dashboard` is also an
      // unrecognised first segment, and it must survive.
      const response = proxy(request("/dashboard"));

      expect(response.headers.get("location")).toBe(
        "http://localhost:3000/en-US/dashboard",
      );
    });

    it.each(["/en-us/dashboard", "/EN-US/dashboard"])(
      "redirects %s to the canonical casing",
      (path) => {
        // next-intl's own behaviour, pinned here so an upgrade cannot drop it
        // silently. We deliberately write no code for this.
        const response = proxy(request(path));

        expect(response.headers.get("location")).toBe(
          "http://localhost:3000/en-US/dashboard",
        );
      },
    );

    it("redirects /pt-br/login to the canonical casing", () => {
      const response = proxy(request("/pt-br/login"));

      expect(response.headers.get("location")).toBe(
        "http://localhost:3000/pt-BR/login",
      );
    });

    it("leaves a valid locale with an unknown route to the router", () => {
      // Only the locale segment is coerced. A 404 on a real locale stays a 404.
      const response = proxy(request("/en-US/nonexistent"));

      expect(response.headers.get("location")).toBeNull();
    });
```

Note: the two casing tests and the `/en-US/nonexistent` test will pass immediately — they pin existing next-intl behaviour. That is their purpose. The rest must fail first.

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx vitest run src/proxy.spec.ts`
Expected: the coercion tests FAIL, e.g. `expected 'http://localhost:3000/en-US/abc/dashboard' to be 'http://localhost:3000/en-US/dashboard'`. Record which ones passed already.

- [ ] **Step 3: Write the implementation**

Rewrite `src/proxy.ts` as follows. The `carryCookies` helper is extracted because the existing auth gate already needed it and the new branch needs the same thing.

```ts
import createIntlMiddleware from "next-intl/middleware";
import { hasLocale } from "next-intl";
import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

import { stripUnknownLocale } from "@/i18n/locale-segment";
import { routing } from "@/i18n/routing";

const handleLocaleRouting = createIntlMiddleware(routing);

/**
 * Paths that require a session, written without their locale prefix. Add to
 * this list as protected segments are introduced.
 */
const PROTECTED_PATHS = ["/dashboard"];

/**
 * Splits `/de-DE/dashboard` into its locale and the rest. Falls back to the
 * default locale for an unprefixed path, which only happens on requests the
 * locale middleware is about to redirect anyway.
 */
function splitLocale(pathname: string) {
  const [, first, ...others] = pathname.split("/");

  return hasLocale(routing.locales, first)
    ? { locale: first, path: `/${others.join("/")}` }
    : { locale: routing.defaultLocale, path: pathname };
}

/**
 * Moves any cookie the locale middleware set — most importantly NEXT_LOCALE —
 * onto a redirect of our own. A bare redirect would drop it and the negotiated
 * locale would have to be worked out again on the next request.
 */
function carryCookies(target: NextResponse, source: NextResponse) {
  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie);
  }
  return target;
}

/**
 * `/abc/dashboard` → `/en-US/dashboard`, rather than next-intl's default of
 * prefixing the bogus segment into `/en-US/abc/dashboard` and 404ing.
 *
 * The shortened path is handed to next-intl so its own resolution order —
 * NEXT_LOCALE cookie, then Accept-Language, then the default — decides the
 * replacement. Nothing here reimplements that.
 *
 * Returns `undefined` when the path needs no coercion, which is every
 * well-formed request.
 */
function coerceUnknownLocale(request: NextRequest) {
  const stripped = stripUnknownLocale(request.nextUrl.pathname);
  if (stripped === null) return undefined;

  const url = request.nextUrl.clone();
  url.pathname = stripped;

  const response = handleLocaleRouting(new NextRequest(url, request));
  if (response.headers.has("location")) return response;

  // The stripped path already carried a valid locale — `/abc/de-DE/login`.
  // next-intl saw nothing to correct, so the browser is still sitting on the
  // bogus URL and we have to move it ourselves.
  return carryCookies(NextResponse.redirect(url), response);
}

// The auth check here is NOT a security boundary. It only checks that a
// session cookie exists — a hand-forged cookie passes it. Its only job is
// skipping a wasted render for signed-out visitors. The real check is
// auth.api.getSession() inside app/[locale]/dashboard/page.tsx.
export function proxy(request: NextRequest) {
  const coerced = coerceUnknownLocale(request);
  if (coerced) return coerced;

  const response = handleLocaleRouting(request);

  // The path carried no locale prefix, so this is a redirect to the negotiated
  // one. Nothing to guard yet — the request comes back through here prefixed.
  if (response.headers.has("location")) return response;

  const { locale, path } = splitLocale(request.nextUrl.pathname);

  if (!PROTECTED_PATHS.includes(path)) return response;
  if (getSessionCookie(request)) return response;

  const url = request.nextUrl.clone();
  url.pathname = `/${locale}/login`;

  return carryCookies(NextResponse.redirect(url), response);
}

export const config = {
  // Everything except API routes, Next internals, and anything with a file
  // extension. `api` must stay excluded: better-auth's endpoint at
  // /api/auth/[...all] lives outside the [locale] segment by design.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
```

- [ ] **Step 4: Run the proxy tests**

Run: `npx vitest run src/proxy.spec.ts`
Expected: PASS, including the pre-existing auth-gate tests. If
`"carries the NEXT_LOCALE cookie next-intl set onto the login redirect"`
broke, the `carryCookies` extraction is wrong — fix it rather than the test.

- [ ] **Step 5: Correct the now-false comment in the root layout**

In `src/app/[locale]/layout.tsx`, replace the comment above the `hasLocale` guard (currently lines 40-42, describing `/fr/dashboard` being prefixed rather than coerced — no longer true):

```tsx
  // The proxy coerces an unknown locale segment before the router sees it, so
  // `/fr/dashboard` arrives here as `/en-US/dashboard`. This guard is for the
  // requests the proxy matcher skips — anything with a file extension — where
  // an unsupported tag must still 404.
  if (!hasLocale(routing.locales, locale)) notFound();
```

- [ ] **Step 6: Replace the stale e2e test**

In `e2e/locale.spec.ts`, **delete** the test named
`"404s on an unsupported locale rather than coercing it"` (lines 56-60) and add:

```ts
  test("coerces an unsupported locale instead of 404ing", async ({ page }) => {
    const response = await page.goto("/fr/dashboard");

    // Unauthenticated, so the pre-existing auth gate carries on to /login —
    // on the coerced URL, not the bogus one.
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL("/en-US/login");
  });

  test("coerces a nonsense locale and keeps the path", async ({ page }) => {
    await page.goto("/abc/dashboard");

    await expect(page).toHaveURL("/en-US/login");
  });
```

The signed-in case is added in Task 4, where a registered user is already at hand.

- [ ] **Step 7: Run that e2e file only**

Run: `npx playwright test e2e/locale.spec.ts`
Expected: PASS, 7 tests.

Do **not** run the whole e2e suite here.

- [ ] **Step 8: Document the behaviour**

In `.claude/rules/i18n.md`, add this section immediately after the
"Navigate with `@/i18n/navigation`" section:

```markdown
## An unsupported locale in the URL is coerced, not 404ed

`/abc/dashboard` and `/fr/dashboard` both redirect to `/en-US/dashboard` — or
to whatever `NEXT_LOCALE` and `Accept-Language` resolve to. `src/proxy.ts`
strips a leading segment that `src/i18n/locale-segment.ts` judges to be shaped
like a language tag but is not one of ours, then lets next-intl prefix what is
left.

Two things this deliberately does **not** do:

- **Invent a region.** `/de` is not coerced to `/de-DE`; it falls back like any
  other unknown tag. Guessing that `/pt` means `pt-BR` rather than `pt-PT` is
  not a guess worth making.
- **Touch anything but the locale segment.** `/en-US/nonexistent` still 404s.

Casing is handled by next-intl itself — `/en-us/dashboard` redirects to
`/en-US/dashboard` with no code of ours. `src/proxy.spec.ts` pins that so an
upgrade cannot drop it quietly.

**A new top-level route may not be two or three letters long.** `/faq` would be
read as a broken language tag and stripped. The guard test in
`src/i18n/locale-segment.spec.ts` fails if one is ever added; rename the route
rather than widening the regex.
```

- [ ] **Step 9: Full verification**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all tests green; tsc clean; lint reports exactly the one pre-existing `use-mobile.ts` error.

- [ ] **Step 10: Commit**

```bash
git add src/proxy.ts src/proxy.spec.ts "src/app/[locale]/layout.tsx" e2e/locale.spec.ts .claude/rules/i18n.md
git commit -m "feat(i18n): coerce an unknown locale segment instead of 404ing"
```

---

### Task 3: The locale switcher control

Builds the component and its catalog entries. It is not mounted yet — Task 4 does that — so this task's deliverable is a tested, unused component.

**Files:**
- Create: `src/components/ui/dropdown-menu.tsx` (via the shadcn CLI)
- Create: `src/components/nav/locale-switcher.tsx`
- Create: `src/components/nav/locale-switcher.spec.tsx`
- Modify: `messages/en-US.json`, `messages/pt-BR.json`, `messages/de-DE.json`

**Interfaces:**
- Consumes: `routing.locales`; `usePathname`, `useRouter` from `@/i18n/navigation`; `useLocale`, `useTranslations` from `next-intl`.
- Produces: `LocaleSwitcher` — a named export, no props.

- [ ] **Step 1: Add the dropdown-menu primitive**

Run: `npx shadcn@latest add dropdown-menu`

This writes `src/components/ui/dropdown-menu.tsx`. Confirm it exports at least
`DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`,
`DropdownMenuRadioGroup`, and `DropdownMenuRadioItem`, and that it imports from
`@base-ui/react/menu`. If the CLI cannot reach the registry, stop and report —
do not hand-write the primitive.

- [ ] **Step 2: Add the catalog keys**

Add a new top-level `nav` namespace to all three files, placed after
`dashboard`.

`messages/en-US.json`:

```json
  "nav": {
    "localeSwitcher": {
      "label": "Language",
      "locales": {
        "en-US": "English",
        "pt-BR": "Português (Brasil)",
        "de-DE": "Deutsch"
      }
    }
  },
```

`messages/pt-BR.json` — same block, `"label": "Idioma"`.

`messages/de-DE.json` — same block, `"label": "Sprache"`.

The three `locales` blocks are **identical in all three files**. That is
deliberate, not a copy-paste slip: language names are endonyms, so someone
hunting for their own language scans for "Português" whatever the interface
language happens to be. Only `label` is translated.

- [ ] **Step 3: Write the failing test**

Create `src/components/nav/locale-switcher.spec.tsx`:

```tsx
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test-utils/intl";
import { routing } from "@/i18n/routing";

const { replace, pathname } = vi.hoisted(() => ({
  replace: vi.fn(),
  pathname: vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => pathname(),
}));

import { LocaleSwitcher } from "@/components/nav/locale-switcher";

describe("LocaleSwitcher", () => {
  beforeEach(() => {
    replace.mockReset();
    pathname.mockReset();
    pathname.mockReturnValue("/dashboard");
  });

  // Queried without a name: the component renders exactly one button, and its
  // accessible name is localized ("Idioma …", "Sprache …"), so matching on
  // English text would break the two non-English cases below.
  function trigger() {
    return screen.getByRole("button");
  }

  it("shows the active locale on the trigger", () => {
    renderWithIntl(<LocaleSwitcher />, "pt-BR");

    // The endonym, and the same one in every interface language.
    expect(trigger()).toHaveTextContent("Português (Brasil)");
  });

  it("offers one option per configured locale", async () => {
    const user = userEvent.setup();
    renderWithIntl(<LocaleSwitcher />);

    await user.click(trigger());

    const options = await screen.findAllByRole("menuitemradio");
    // Driven by routing.locales, so adding a locale without adding an option
    // fails here rather than shipping a menu that silently omits it.
    expect(options).toHaveLength(routing.locales.length);
  });

  it("marks the active locale as checked", async () => {
    const user = userEvent.setup();
    renderWithIntl(<LocaleSwitcher />, "de-DE");

    await user.click(trigger());

    const checked = await screen.findByRole("menuitemradio", { checked: true });
    expect(checked).toHaveTextContent("Deutsch");
  });

  it("navigates to the current path under the chosen locale", async () => {
    const user = userEvent.setup();
    pathname.mockReturnValue("/dashboard");
    renderWithIntl(<LocaleSwitcher />);

    await user.click(trigger());
    await user.click(await screen.findByRole("menuitemradio", { name: "Deutsch" }));

    // Both arguments asserted: hardcoding either the path or the locale fails.
    expect(replace).toHaveBeenCalledWith("/dashboard", { locale: "de-DE" });
  });

  it("uses the real current path, not a fixed one", async () => {
    const user = userEvent.setup();
    pathname.mockReturnValue("/some/other/page");
    renderWithIntl(<LocaleSwitcher />);

    await user.click(trigger());
    await user.click(await screen.findByRole("menuitemradio", { name: "Deutsch" }));

    expect(replace).toHaveBeenCalledWith("/some/other/page", { locale: "de-DE" });
  });

  it("does not navigate when the active locale is chosen again", async () => {
    const user = userEvent.setup();
    renderWithIntl(<LocaleSwitcher />);

    await user.click(trigger());
    await user.click(await screen.findByRole("menuitemradio", { name: "English" }));

    expect(replace).not.toHaveBeenCalled();
  });

  it("closes the menu after a choice", async () => {
    const user = userEvent.setup();
    renderWithIntl(<LocaleSwitcher />);

    await user.click(trigger());
    await user.click(await screen.findByRole("menuitemradio", { name: "Deutsch" }));

    // Base UI defaults MenuRadioItem's closeOnClick to false, so the menu
    // would otherwise stay open over the page after switching.
    expect(screen.queryByRole("menuitemradio")).not.toBeInTheDocument();
  });

  it("keeps an accessible name when the sidebar rail is collapsed", () => {
    renderWithIntl(<LocaleSwitcher />);

    // The label is sr-only rather than hidden: display:none would strip it
    // from the accessibility tree and leave the trigger unnamed once the rail
    // collapses to icons.
    expect(within(trigger()).getByText("Language")).toHaveClass("sr-only");
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `npx vitest run src/components/nav/locale-switcher.spec.tsx`
Expected: FAIL — `Failed to resolve import "@/components/nav/locale-switcher"`.

- [ ] **Step 5: Write the implementation**

Create `src/components/nav/locale-switcher.tsx`:

```tsx
"use client";

import { useLocale, useTranslations } from "next-intl";
import { Globe } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

type Locale = (typeof routing.locales)[number];

/**
 * Changes the active locale from inside the app shell.
 *
 * There is no local pending state. A locale switch is a route change, so the
 * segment's `loading.tsx` skeleton already covers it — which is what
 * `.claude/rules/navigation-loading.md` prescribes for navigation inside the
 * shell. Do not add a full-screen overlay here; it would blank the sidebar.
 */
export function LocaleSwitcher() {
  const t = useTranslations("nav.localeSwitcher");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  // Base UI types the radio group's value as `any`, so narrow it here rather
  // than trusting the callback's parameter.
  function handleChange(value: unknown) {
    const next = value as Locale;
    if (next === locale) return;

    // `pathname` from @/i18n/navigation is already locale-free, so this is
    // the same page in another language. next-intl's client router writes
    // NEXT_LOCALE itself via syncLocaleCookie — nothing here touches
    // document.cookie.
    router.replace(pathname, { locale: next });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="sm" className="w-full justify-start" />}
      >
        <Globe aria-hidden="true" />
        {/* Always sr-only: it names the control for screen readers while the
            visible text carries the current value. */}
        <span className="sr-only">{t("label")}</span>
        <span className="group-data-[collapsible=icon]:sr-only">
          {t(`locales.${locale}`)}
        </span>
      </DropdownMenuTrigger>

      <DropdownMenuContent side="top" align="start">
        <DropdownMenuRadioGroup value={locale} onValueChange={handleChange}>
          {routing.locales.map((option) => (
            // closeOnClick is explicit: Base UI defaults it to false on a
            // radio item, which would leave the menu open after switching.
            <DropdownMenuRadioItem key={option} value={option} closeOnClick>
              {t(`locales.${option}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

Two things that may need adjusting against the generated primitive:

- If `DropdownMenuTrigger`'s `render` prop does not pass children through to
  the `Button`, use the callback form:
  `render={(props) => <Button variant="ghost" size="sm" className="w-full justify-start" {...props} />}`
  and move the children inside it.
- If `` t(`locales.${locale}`) `` does not typecheck — the template literal
  should resolve to a union of three literal keys — replace it with an explicit
  `Record<Locale, "locales.en-US" | "locales.pt-BR" | "locales.de-DE">` lookup.
  **Do not cast to `any`**: the compile-time link between `routing.locales` and
  the catalog is the thing keeping a new locale from shipping unnamed.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/components/nav/locale-switcher.spec.tsx`
Expected: PASS, 8 tests.

- [ ] **Step 7: Prove the close-on-click test is real**

Remove `closeOnClick` from the radio item and re-run. The
`"closes the menu after a choice"` test must FAIL. Put it back.

If it passes without `closeOnClick`, the default changed — delete the prop and
the test's comment, and say so in your report.

- [ ] **Step 8: Full verification**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: green, including `src/i18n/messages.spec.ts` confirming the new keys
exist in all three catalogs.

- [ ] **Step 9: Commit**

```bash
git add src/components/ui/dropdown-menu.tsx src/components/nav/locale-switcher.tsx src/components/nav/locale-switcher.spec.tsx messages/
git commit -m "feat(i18n): add the locale switcher control"
```

---

### Task 4: Mount the switcher in the sidebar footer

**Files:**
- Modify: `src/app/[locale]/dashboard/layout.tsx:72-78`
- Modify: `e2e/locale.spec.ts`
- Modify: `.claude/rules/i18n.md`

**Interfaces:**
- Consumes: `LocaleSwitcher` from Task 3.
- Produces: nothing new.

- [ ] **Step 1: Write the failing e2e tests**

Add to `e2e/locale.spec.ts`. It currently imports nothing from `./helpers`; add
`import { path, registerUser } from "./helpers";` at the top.

```ts
  test("switches locale from the sidebar and remembers the choice", async ({ page }) => {
    await registerUser(page);
    await expect(page).toHaveURL(path("/dashboard"));

    await page.getByRole("button", { name: /language/i }).click();
    await page.getByRole("menuitemradio", { name: "Deutsch" }).click();

    await expect(page).toHaveURL(path("/dashboard", "de-DE"));
    await expect(page.getByRole("button", { name: "Abmelden" })).toBeVisible();

    // The real proof the cookie was written: an unprefixed URL now negotiates
    // to German. Reloading the German URL would prove nothing.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(path("/dashboard", "de-DE"));
  });

  test("coerces an unknown locale for a signed-in visitor", async ({ page }) => {
    await registerUser(page);
    await expect(page).toHaveURL(path("/dashboard"));

    await page.goto("/abc/dashboard");

    await expect(page).toHaveURL(path("/dashboard"));
    await expect(page.getByRole("heading", { name: /Signed in/ })).toBeVisible();
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx playwright test e2e/locale.spec.ts`
Expected: the switcher test FAILS — no button named "language" exists yet. The
coercion test should already PASS from Task 2; confirm that it does.

- [ ] **Step 3: Mount the component**

In `src/app/[locale]/dashboard/layout.tsx`, add the import:

```tsx
import { LocaleSwitcher } from "@/components/nav/locale-switcher";
```

and replace the `SidebarFooter` block:

```tsx
          {/* Pinned to the bottom: SidebarContent above it takes the flex-1. */}
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <LocaleSwitcher />
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SignOutButton />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
```

- [ ] **Step 4: Run the e2e file**

Run: `npx playwright test e2e/locale.spec.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Check it by eye**

Run `npm run dev`, register, and confirm at `/en-US/dashboard`:

- The switcher sits directly above "Sign out" and matches its styling.
- Collapsing the rail (the trigger in the header) leaves a globe icon with no
  clipped text, and the menu still opens.
- Switching to Deutsch changes the sidebar copy and the URL.

Stop the dev server afterwards. A stray `next dev` holds Windows file locks
that break later `git mv` operations.

- [ ] **Step 6: Document it**

In `.claude/rules/i18n.md`, add at the end of the "An unsupported locale in the
URL is coerced" section you added in Task 2:

```markdown
## Changing locale

`src/components/nav/locale-switcher.tsx` sits in the sidebar footer beside the
sign-out button. It calls `router.replace(pathname, { locale })` — `pathname`
from `@/i18n/navigation` is already locale-free, so it is the same page in
another language.

It writes no cookie. next-intl's client router calls `syncLocaleCookie` on a
locale switch, and the middleware ignores non-`document` requests so a prefetch
cannot clobber a fresh choice. Do not add cookie handling here.

It has no pending state either: the switch is a route change, so
`dashboard/loading.tsx` covers it. See `.claude/rules/navigation-loading.md`.

Language names are endonyms — "Português (Brasil)", not "Portuguese (Brazil)" —
so `nav.localeSwitcher.locales.*` holds identical values in all three catalogs.
Only `nav.localeSwitcher.label` is translated.
```

- [ ] **Step 7: Full verification**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: green; build emits three SSG entries under `/[locale]`.

- [ ] **Step 8: Commit**

```bash
git add "src/app/[locale]/dashboard/layout.tsx" e2e/locale.spec.ts .claude/rules/i18n.md
git commit -m "feat(i18n): put the locale switcher in the sidebar footer"
```

---

### Task 5: Whole-branch verification

No new code. This is the gate before integration.

**Files:** none.

- [ ] **Step 1: Unit suite**

Run: `npm test`
Expected: green. Record the file and test counts; the baseline before this plan
was 103 tests across 12 files, so the number must have gone **up**. A drop
means a test was lost in an edit — find it before continuing.

- [ ] **Step 2: Types**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: exactly one error, `src/hooks/use-mobile.ts:14`. Anything else is
from this work.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: green, three SSG entries under `/[locale]`.

- [ ] **Step 5: Full e2e**

Run: `npm run test:e2e`
Expected: green. This is the one place the full suite runs; it truncates the
test database, which is why every earlier task ran single files.

- [ ] **Step 6: Report**

State the counts for each gate. Do not commit — there is nothing to commit.

---

## Notes for the reviewer

Three things in this plan are worth checking specifically, because they are
where it would be easiest to produce something that looks right and is not:

1. **The route-collision guard must actually enumerate routes.** If
   `topLevelRouteSegments` is pointed at a wrong path it returns `[]`, and
   `it.each([])` registers no tests at all — a silent pass. Task 1 Step 1
   includes an explicit "actually found the routes" assertion for this, and
   Step 5 proves the guard can fail.

2. **`stripUnknownLocale` must leave supported locales alone,** including
   mis-cased ones. If it strips `/en-us/dashboard`, the user gets the fallback
   locale instead of the English they asked for — and every existing test still
   passes, because the fallback happens to be `en-US`. The `pt-br` case is the
   one that would actually catch it.

3. **The casing tests pass without any new production code.** That is intended
   and is stated in the plan. Do not let an implementer "fix" them into
   something that exercises `stripUnknownLocale` instead — their whole value is
   pinning behaviour we did not write.
