import { describe, expect, it } from "vitest";

import {
  CARD_TYPES,
  createCardSchema,
  MAX_CARD_NAME_LENGTH,
  MIN_CARD_NAME_LENGTH,
  type CardValidationTranslator,
} from "@/lib/validations/card";

/**
 * Echoes the key back, with any interpolated values appended, so a test can
 * assert both which message fired and what was substituted into it —
 * without depending on a word of real catalog copy. Same pattern as
 * category.spec.ts.
 */
const t: CardValidationTranslator = (key, values) =>
  values ? `${key}:${JSON.stringify(values)}` : key;

const cardSchema = createCardSchema(t);

function errorsFor(result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) {
  if (result.success || !result.error) return {};
  return Object.fromEntries(
    result.error.issues.map((issue) => [String(issue.path[0]), issue.message]),
  );
}

describe("createCardSchema", () => {
  const valid = { name: "Personal Visa", type: "CREDIT" as const };

  it("accepts a complete valid payload", () => {
    expect(cardSchema.safeParse(valid).success).toBe(true);
  });

  it("requires a name of at least the minimum length", () => {
    const result = cardSchema.safeParse({ ...valid, name: "A" });
    expect(errorsFor(result).name).toBe(`name.tooShort:{"min":${MIN_CARD_NAME_LENGTH}}`);
  });

  it("accepts a name exactly at the minimum length", () => {
    const name = "a".repeat(MIN_CARD_NAME_LENGTH);
    expect(cardSchema.safeParse({ ...valid, name }).success).toBe(true);
  });

  it("accepts a name exactly at the maximum length", () => {
    const name = "a".repeat(MAX_CARD_NAME_LENGTH);
    expect(cardSchema.safeParse({ ...valid, name }).success).toBe(true);
  });

  it("rejects a name one character over the maximum, interpolating the bound", () => {
    const result = cardSchema.safeParse({ ...valid, name: "a".repeat(MAX_CARD_NAME_LENGTH + 1) });
    expect(errorsFor(result).name).toBe(`name.tooLong:{"max":${MAX_CARD_NAME_LENGTH}}`);
  });

  it("trims the name before measuring it", () => {
    const result = cardSchema.safeParse({ ...valid, name: "  A  " });
    expect(errorsFor(result).name).toBe(`name.tooShort:{"min":${MIN_CARD_NAME_LENGTH}}`);
  });

  it("rejects a type outside DEBIT/CREDIT", () => {
    const result = cardSchema.safeParse({ ...valid, type: "PREPAID" });
    expect(errorsFor(result).type).toBe("type.invalid");
  });

  it("rejects a missing type", () => {
    const { type, ...withoutType } = valid;
    const result = cardSchema.safeParse(withoutType);
    expect(errorsFor(result).type).toBe("type.invalid");
  });

  it("accepts every value in CARD_TYPES", () => {
    CARD_TYPES.forEach((type) => {
      expect(cardSchema.safeParse({ ...valid, type }).success).toBe(true);
    });
  });
});
