import { CATEGORY_PRESETS, type CategoryPresetKey } from "./category-presets";

export type CategoryDisplay = {
  name: string;
  description: string | null;
};

export type CategoryInput = {
  name: string;
  description: string | null;
  systemLocaleKey: string | null;
};

/**
 * Every message key this function can emit, relative to the
 * `categories.presets` namespace — the same shape as
 * `CategoryValidationTranslator` in `src/lib/validations/category.ts`, and for
 * the same reason: declaring the union explicitly is what lets a real
 * `getTranslations("categories.presets")` be passed in at all. A translator
 * typed `(key: string) => string` is *wider* than next-intl's, and under
 * `strictFunctionTypes` the real one is therefore not assignable to it.
 *
 * A plain `(key: string) => string` stub still satisfies this — a wider
 * parameter is fine — so the key-echoing test stubs are unaffected.
 */
type PresetMessageKey = `${CategoryPresetKey}.name` | `${CategoryPresetKey}.description`;

export type CategoryPresetTranslator = (key: PresetMessageKey) => string;

/**
 * Narrows a raw `systemLocaleKey` column to a known preset key. A row could
 * hold anything — a preset renamed or dropped in a later release, say — so
 * this is a runtime check, not a cast.
 */
function isPresetKey(value: string): value is CategoryPresetKey {
  return CATEGORY_PRESETS.some((preset) => preset.key === value);
}

/**
 * Resolves the display text for a category.
 *
 * @param category - A category with name, description, and optional systemLocaleKey
 * @param t - A translator function scoped to "categories.presets" namespace
 * @returns An object with resolved name and description
 *
 * If systemLocaleKey is null (custom category), returns the raw name/description.
 * If systemLocaleKey matches a preset key, returns translated text.
 * If systemLocaleKey is unrecognized, falls back to raw columns without throwing.
 */
export function resolveCategoryDisplay(
  category: CategoryInput,
  t: CategoryPresetTranslator
): CategoryDisplay {
  // No systemLocaleKey means a custom category — and an unrecognized one means
  // a key this build no longer knows about. Both fall back to the raw columns
  // rather than handing next-intl a key it would throw on.
  if (category.systemLocaleKey === null || !isPresetKey(category.systemLocaleKey)) {
    return {
      name: category.name,
      description: category.description,
    };
  }

  // Valid preset key - resolve from translator
  return {
    name: t(`${category.systemLocaleKey}.name`),
    description: t(`${category.systemLocaleKey}.description`),
  };
}
