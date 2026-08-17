import { z } from "zod";

import { MAX_INSTALLMENT_OCCURRENCES, RECURRING_FREQUENCIES } from "@/lib/transactions/occurrences";
import {
  incomeHasNoCard,
  isoDateField,
  sharedTransactionFields,
  TRANSACTION_TYPES,
  TRANSACTION_ID_MAX_LENGTH,
  type TransactionValidationTranslator,
} from "@/lib/validations/transaction";

/**
 * A closed plan: every occurrence is generated at creation, so the count is
 * required and bounded. `MAX_INSTALLMENT_OCCURRENCES` is the same bound
 * `occurrenceDates` enforces at the last moment — this one exists to tell the
 * user, that one to make an unbounded write impossible.
 */
export function createInstallmentSchema(t: TransactionValidationTranslator) {
  return z
    .object({
      ...sharedTransactionFields(t),
      startDate: isoDateField(t),
      frequency: z.enum(RECURRING_FREQUENCIES, t("frequency.invalid")),
      occurrencesCount: z.coerce
        .number(t("occurrences.invalid"))
        .int(t("occurrences.invalid"))
        .min(1, t("occurrences.invalid"))
        .max(
          MAX_INSTALLMENT_OCCURRENCES,
          t("occurrences.tooMany", { max: MAX_INSTALLMENT_OCCURRENCES }),
        ),
    })
    .superRefine(incomeHasNoCard(t));
}

export type InstallmentValues = z.infer<ReturnType<typeof createInstallmentSchema>>;

/**
 * The series-level half of the plan edit page: the fields that classify the
 * whole series and are written to the definition *and* every occurrence.
 * Amount, date, description, and paid are edited per occurrence instead, so
 * they are deliberately absent here.
 *
 * `type` is a series field because `cardId` must be null exactly when the
 * type is `INCOME` — letting one occurrence flip to income would break that
 * invariant for the row while the series still carried a card.
 */
export function createInstallmentSeriesSchema(t: TransactionValidationTranslator) {
  return z
    .object({
      type: z.enum(TRANSACTION_TYPES, t("type.invalid")),
      categoryId: z
        .string()
        .trim()
        .min(1, t("category.required"))
        .max(TRANSACTION_ID_MAX_LENGTH, t("category.required")),
      cardId: z
        .union([z.string().trim().max(TRANSACTION_ID_MAX_LENGTH, t("card.invalid")), z.null()])
        .optional()
        .transform((value) => (value ? value : null)),
    })
    .superRefine(incomeHasNoCard(t));
}

export type InstallmentSeriesValues = z.infer<ReturnType<typeof createInstallmentSeriesSchema>>;
