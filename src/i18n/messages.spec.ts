import { describe, expect, it } from "vitest";

import { routing } from "@/i18n/routing";

import deDE from "../../messages/de-DE.json";
import enUS from "../../messages/en-US.json";
import ptBR from "../../messages/pt-BR.json";

type Catalog = { [key: string]: string | Catalog };

const catalogs: Record<string, Catalog> = {
  "en-US": enUS as unknown as Catalog,
  "pt-BR": ptBR as unknown as Catalog,
  "de-DE": deDE as unknown as Catalog,
};

/** Flattens a catalog to sorted dotted paths: `auth.login.title`. */
function keyPaths(catalog: Catalog, prefix = ""): string[] {
  return Object.entries(catalog)
    .flatMap(([key, value]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return typeof value === "string" ? [path] : keyPaths(value, path);
    })
    .sort();
}

/** Reads a dotted path out of a catalog. */
function valueAt(catalog: Catalog, path: string): string {
  const value = path
    .split(".")
    .reduce<string | Catalog>((node, key) => (node as Catalog)[key], catalog);
  return value as string;
}

/** The `{name}`-style placeholders a message declares, sorted. */
function placeholders(message: string): string[] {
  return [...message.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

const reference = keyPaths(catalogs["en-US"]);
const translations = ["pt-BR", "de-DE"] as const;

describe("message catalogs", () => {
  it("has a catalog for every configured locale", () => {
    expect(Object.keys(catalogs).sort()).toEqual([...routing.locales].sort());
  });

  it.each(translations)("%s has exactly the same keys as en-US", (locale) => {
    const keys = keyPaths(catalogs[locale]);

    // Asserted as two directed differences rather than a single toEqual, so a
    // failure names the missing and the stray keys instead of dumping both
    // full lists side by side.
    expect(reference.filter((key) => !keys.includes(key))).toEqual([]);
    expect(keys.filter((key) => !reference.includes(key))).toEqual([]);
  });

  it.each(translations)("%s declares the same placeholders as en-US", (locale) => {
    const mismatched = reference.filter(
      (key) =>
        placeholders(valueAt(catalogs[locale], key)).join() !==
        placeholders(valueAt(catalogs["en-US"], key)).join(),
    );

    // A dropped {max} silently renders the literal text, so this is worth its
    // own assertion rather than trusting review.
    expect(mismatched).toEqual([]);
  });

  it.each(Object.keys(catalogs))("%s has no empty messages", (locale) => {
    const empty = keyPaths(catalogs[locale]).filter(
      (key) => valueAt(catalogs[locale], key).trim() === "",
    );

    expect(empty).toEqual([]);
  });
});
