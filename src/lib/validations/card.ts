import { z } from "zod";

/**
 * Bounds on the name field. Mirrors MIN/MAX_CATEGORY_NAME_LENGTH in
 * src/lib/validations/category.ts — generous enough never to reject a real
 * card name, bounded so nothing unbounded reaches the database.
 */
export const MIN_CARD_NAME_LENGTH = 3;
export const MAX_CARD_NAME_LENGTH = 50;

/**
 * Hard cap on how many *active* cards one user may hold — a soft-deleted row
 * frees a slot. `createCard` in `src/lib/actions/cards.ts` is where this is
 * enforced; the list page reads it only to disable the "New card" action,
 * which is a convenience, not the enforcement. Matches MAX_ACTIVE_CATEGORIES
 * exactly, per the design spec's explicit decision.
 */
export const MAX_ACTIVE_CARDS = 50;

/** The only two values `Card.type` may hold — matches the Prisma `CardType` enum. */
export const CARD_TYPES = ["DEBIT", "CREDIT"] as const;
export type CardType = (typeof CARD_TYPES)[number];

/**
 * Every message key this schema can emit, relative to the `validation.cards`
 * namespace.
 */
export type CardValidationKey = "name.tooShort" | "name.tooLong" | "type.invalid";

export type CardValidationTranslator = (
  key: CardValidationKey,
  values?: Record<string, string | number>,
) => string;

export function createCardSchema(t: CardValidationTranslator) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(MIN_CARD_NAME_LENGTH, t("name.tooShort", { min: MIN_CARD_NAME_LENGTH }))
      .max(MAX_CARD_NAME_LENGTH, t("name.tooLong", { max: MAX_CARD_NAME_LENGTH })),
    type: z.enum(CARD_TYPES, t("type.invalid")),
  });
}

export type CardValues = z.infer<ReturnType<typeof createCardSchema>>;
