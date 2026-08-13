import { describe, expect, it } from "vitest";

import { CATEGORY_ICONS } from "@/lib/category-icons";
import {
  createCategorySchema,
  MAX_CATEGORY_DESCRIPTION_LENGTH,
  MAX_CATEGORY_NAME_LENGTH,
  MIN_CATEGORY_NAME_LENGTH,
  type CategoryValidationTranslator,
} from "@/lib/validations/category";

/**
 * Echoes the key back, with any interpolated values appended, so a test can
 * assert both which message fired and what was substituted into it — without
 * depending on a single word of user-facing copy.
 */
const t: CategoryValidationTranslator = (key, values) =>
  values ? `${key}:${JSON.stringify(values)}` : key;

const categorySchema = createCategorySchema(t);

function errorsFor(result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) {
  if (result.success || !result.error) return {};
  return Object.fromEntries(
    result.error.issues.map((issue) => [String(issue.path[0]), issue.message]),
  );
}

describe("createCategorySchema", () => {
  const valid = {
    name: "Groceries",
    icon: "shopping-basket",
    description: "Food and household items",
  };

  it("accepts a complete valid payload", () => {
    expect(categorySchema.safeParse(valid).success).toBe(true);
  });

  it("requires a name of at least the minimum length", () => {
    const result = categorySchema.safeParse({ ...valid, name: "A" });
    expect(errorsFor(result).name).toBe(`name.tooShort:{"min":${MIN_CATEGORY_NAME_LENGTH}}`);
  });

  it("accepts a name exactly at the minimum length", () => {
    const name = "a".repeat(MIN_CATEGORY_NAME_LENGTH);
    expect(categorySchema.safeParse({ ...valid, name }).success).toBe(true);
  });

  it("accepts a name exactly at the maximum length", () => {
    const name = "a".repeat(MAX_CATEGORY_NAME_LENGTH);
    expect(categorySchema.safeParse({ ...valid, name }).success).toBe(true);
  });

  it("rejects a name one character over the maximum, interpolating the bound", () => {
    const result = categorySchema.safeParse({ ...valid, name: "a".repeat(MAX_CATEGORY_NAME_LENGTH + 1) });
    expect(errorsFor(result).name).toBe(`name.tooLong:{"max":${MAX_CATEGORY_NAME_LENGTH}}`);
  });

  it("trims the name before measuring it", () => {
    const result = categorySchema.safeParse({ ...valid, name: "  A  " });
    expect(errorsFor(result).name).toBe(`name.tooShort:{"min":${MIN_CATEGORY_NAME_LENGTH}}`);
  });

  it("accepts a description exactly at the maximum length", () => {
    const description = "a".repeat(MAX_CATEGORY_DESCRIPTION_LENGTH);
    expect(categorySchema.safeParse({ ...valid, description }).success).toBe(true);
  });

  it("rejects a description one character over the maximum, interpolating the bound", () => {
    const result = categorySchema.safeParse({
      ...valid,
      description: "a".repeat(MAX_CATEGORY_DESCRIPTION_LENGTH + 1),
    });
    expect(errorsFor(result).description).toBe(
      `description.tooLong:{"max":${MAX_CATEGORY_DESCRIPTION_LENGTH}}`,
    );
  });

  it("normalizes an empty description to undefined via transform", () => {
    const result = categorySchema.safeParse({ ...valid, description: "" });
    expect(result.success && result.data.description).toBe(undefined);
  });

  it("normalizes a whitespace-only description to undefined via transform", () => {
    const result = categorySchema.safeParse({ ...valid, description: "   " });
    expect(result.success && result.data.description).toBe(undefined);
  });

  it("allows description to be omitted entirely", () => {
    const { description, ...withoutDescription } = valid;
    const result = categorySchema.safeParse(withoutDescription);
    expect(result.success && result.data.description).toBe(undefined);
  });

  it("rejects an icon not in the allow-list", () => {
    const result = categorySchema.safeParse({ ...valid, icon: "invalid-icon" });
    expect(errorsFor(result).icon).toBe("icon.invalid");
  });

  it("accepts every icon in the allow-list", () => {
    const icons = Object.keys(CATEGORY_ICONS) as Array<keyof typeof CATEGORY_ICONS>;
    icons.forEach((icon) => {
      const result = categorySchema.safeParse({ ...valid, icon });
      expect(result.success).toBe(true);
    });
  });
});
