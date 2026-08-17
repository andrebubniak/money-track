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

/** Days for the fixed-length steps; months for the calendar-aware ones. */
const DAY_STEP: Partial<Record<RecurringFrequency, number>> = {
  DAILY: 1,
  WEEKLY: 7,
  BIWEEKLY: 14,
};

const MONTH_STEP: Partial<Record<RecurringFrequency, number>> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMIANNUAL: 6,
  YEARLY: 12,
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
  const days = DAY_STEP[frequency];
  const months = MONTH_STEP[frequency];

  return Array.from({ length: Math.max(count, 0) }, (_unused, index) =>
    days === undefined ? addMonthsUtc(first, months! * index) : addDaysUtc(first, days * index),
  );
}
