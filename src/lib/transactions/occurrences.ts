import { addDaysUtc, addMonthsUtc, toUtcMidnight } from "@/lib/dates";

/**
 * Hard ceiling on how many rows one installment plan may generate. Eager
 * generation is unbounded work driven by a user-supplied number, so it needs
 * a bound that does not depend on the form validating first. 100 monthly
 * occurrences is already more than eight years.
 */
export const MAX_INSTALLMENT_OCCURRENCES = 100;

/** Mirrors the Prisma `RecurringFrequency` enum. */
export const RECURRING_FREQUENCIES = [
  "DAILY",
  "WEEKLY",
  "BIWEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "SEMIANNUAL",
  "YEARLY",
] as const;

export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];

/**
 * Maps each frequency to its step unit and count. Exhaustive over RECURRING_FREQUENCIES
 * so the compiler catches omissions — missing a frequency here is a compile error,
 * not a runtime Invalid Date written to the database.
 */
const FREQUENCY_STEP: Record<RecurringFrequency, { unit: "day" | "month"; step: number }> = {
  DAILY: { unit: "day", step: 1 },
  WEEKLY: { unit: "day", step: 7 },
  BIWEEKLY: { unit: "day", step: 14 },
  MONTHLY: { unit: "month", step: 1 },
  QUARTERLY: { unit: "month", step: 3 },
  SEMIANNUAL: { unit: "month", step: 6 },
  YEARLY: { unit: "month", step: 12 },
};

/**
 * The full date series for an installment plan, first occurrence on the start
 * date itself. Every date is UTC midnight.
 */
export function occurrenceDates(
  start: string | Date,
  frequency: RecurringFrequency,
  count: number,
): Date[] {
  if (count > MAX_INSTALLMENT_OCCURRENCES) {
    throw new Error(`occurrenceDates: count ${count} exceeds ${MAX_INSTALLMENT_OCCURRENCES}`);
  }

  const first = toUtcMidnight(start);
  const { unit, step } = FREQUENCY_STEP[frequency];

  // Math.max(count, 0) defends against negative counts passed by the caller.
  return Array.from({ length: Math.max(count, 0) }, (_unused, index) =>
    unit === "day"
      ? addDaysUtc(first, step * index)
      : addMonthsUtc(first, step * index),
  );
}
