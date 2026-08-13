import { CATEGORY_PRESETS } from "./category-presets";

export type CategoryDisplay = {
  name: string;
  description: string | null;
};

export type CategoryInput = {
  name: string;
  description: string | null;
  systemLocaleKey: string | null;
};

type Translator = (key: string) => string;

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
  t: Translator
): CategoryDisplay {
  // If no systemLocaleKey, it's a custom category - return raw columns
  if (category.systemLocaleKey === null) {
    return {
      name: category.name,
      description: category.description,
    };
  }

  // Check if systemLocaleKey matches a known preset key
  const isValidPresetKey = CATEGORY_PRESETS.some(
    (p) => p.key === category.systemLocaleKey
  );

  // If it's not a valid preset key, fall back to raw columns
  if (!isValidPresetKey) {
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
