import { z } from "zod";

import { isCategoryIcon } from "@/lib/category-icons";

/**
 * Bounds on free-text fields. Kept generous enough never to reject a real
 * category name or description, but bounded so nothing unbounded reaches the database.
 *
 * These are interpolated into messages as `{min}` / `{max}` rather than
 * written into the copy, so the number lives in exactly one place across all
 * three catalogs.
 */
export const MIN_CATEGORY_NAME_LENGTH = 3;
export const MAX_CATEGORY_NAME_LENGTH = 50;
export const MAX_CATEGORY_DESCRIPTION_LENGTH = 255;

/**
 * Hard cap on how many *active* categories one user may hold — a soft-deleted
 * row frees a slot. `createCategory` in `src/lib/actions/categories.ts` is
 * where this is enforced; the list page reads it only to disable the "New
 * category" action, which is a convenience, not the enforcement.
 *
 * It lives here, beside the other category bounds, rather than in the actions
 * module: that file carries the `"use server"` directive, and such a module may
 * export nothing but async functions, so a plain `const` export from it would
 * not be importable by the page.
 */
export const MAX_ACTIVE_CATEGORIES = 50;

/**
 * Every message key this schema can emit, relative to the `validation.categories`
 * namespace.
 *
 * Declaring the union explicitly is what makes the catalog and the schema
 * check each other: passing a real `useTranslations("validation.categories")` into the
 * factory only type-checks while every key here exists in the catalog.
 */
export type CategoryValidationKey = "name.tooShort" | "name.tooLong" | "description.tooLong" | "icon.invalid";

export type CategoryValidationTranslator = (
  key: CategoryValidationKey,
  values?: Record<string, string | number>,
) => string;

export function createCategorySchema(t: CategoryValidationTranslator) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(MIN_CATEGORY_NAME_LENGTH, t("name.tooShort", { min: MIN_CATEGORY_NAME_LENGTH }))
      .max(MAX_CATEGORY_NAME_LENGTH, t("name.tooLong", { max: MAX_CATEGORY_NAME_LENGTH })),
    icon: z.string().refine(isCategoryIcon, t("icon.invalid")),
    description: z
      .string()
      .trim()
      .max(MAX_CATEGORY_DESCRIPTION_LENGTH, t("description.tooLong", { max: MAX_CATEGORY_DESCRIPTION_LENGTH }))
      .transform((v) => (v === "" ? undefined : v))
      .optional(),
  });
}

export type CategoryValues = z.infer<ReturnType<typeof createCategorySchema>>;
