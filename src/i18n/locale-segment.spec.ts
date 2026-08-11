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
