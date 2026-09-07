import { hasLocale, type Locale } from "next-intl";
import { z } from "zod";

import { routing } from "@/i18n/routing";

/** One dropdown page. Small on purpose: the list is scrolled, not scanned. */
export const OPTIONS_PAGE_SIZE = 10;
export const MAX_OPTIONS_QUERY_LENGTH = 100;

export type ComboboxOption = { id: string; name: string };
export type OptionsResponse = { items: ComboboxOption[]; hasMore: boolean };

/**
 * `AsyncCombobox` defaults to a `{ id, text }` item; these endpoints answer
 * with `{ id, name }`, so every call site spreads this rather than repeating
 * the same two lambdas ten times over.
 */
export const comboboxOptionAccessors = {
  getItemId: (option: ComboboxOption) => option.id,
  itemToLabel: (option: ComboboxOption) => option.name,
} as const;

const querySchema = z.string().trim().max(MAX_OPTIONS_QUERY_LENGTH);
const pageSchema = z.coerce.number().int().min(1);

/**
 * Same policy as the list page's `searchParams`: anything malformed falls
 * back to its default rather than producing a 400. These endpoints only ever
 * fail with 401.
 *
 * `locale` is a required part of the contract rather than something resolved
 * here — route handlers live outside the `[locale]` segment, so next-intl
 * cannot work one out. See `.claude/rules/i18n.md`.
 */
export function parseOptionsParams(url: URL): { q: string; page: number; locale: Locale } {
  const rawQuery = querySchema.safeParse(url.searchParams.get("q") ?? "");
  const rawPage = pageSchema.safeParse(url.searchParams.get("page") ?? "1");
  const rawLocale = url.searchParams.get("locale") ?? "";

  return {
    q: rawQuery.success ? rawQuery.data : "",
    page: rawPage.success ? rawPage.data : 1,
    locale: hasLocale(routing.locales, rawLocale) ? rawLocale : routing.defaultLocale,
  };
}

/** Slices one page out of an already-sorted list and reports whether more follow. */
export function pageOf(items: ComboboxOption[], page: number): OptionsResponse {
  const start = (page - 1) * OPTIONS_PAGE_SIZE;
  return {
    items: items.slice(start, start + OPTIONS_PAGE_SIZE),
    hasMore: items.length > start + OPTIONS_PAGE_SIZE,
  };
}
