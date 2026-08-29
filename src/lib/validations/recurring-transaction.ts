import { z } from "zod";

import { RECURRING_FREQUENCIES } from "@/lib/transactions/occurrences";
import {
  incomeHasNoCard,
  isoDateField,
  sharedTransactionFields,
  type TransactionValidationTranslator,
} from "@/lib/validations/transaction";

/**
 * An ongoing recurrence: no end, no occurrence count, and no rows generated
 * at creation. `date`/`paymentDate` are absent by design — those belong to a
 * concrete transaction, and this is a definition.
 */
export function createRecurringTransactionSchema(
  t: TransactionValidationTranslator,
  today: string,
) {
  return z
    .object({
      ...sharedTransactionFields(t),
      startDate: isoDateField(t, today),
      frequency: z.enum(RECURRING_FREQUENCIES, t("frequency.invalid")),
    })
    .superRefine(incomeHasNoCard(t));
}

export type RecurringTransactionValues = z.infer<
  ReturnType<typeof createRecurringTransactionSchema>
>;
