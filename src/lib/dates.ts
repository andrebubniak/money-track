/**
 * Calendar-date arithmetic in UTC.
 *
 * `Transaction.date` and `RecurringTransaction.startDate` are `DateTime`
 * columns holding what users think of as plain calendar dates. Doing the
 * arithmetic in local time would move a date across a day boundary for
 * anyone not on UTC — a transaction entered on the 1st showing up on the
 * 31st of the month before. Everything here reads and writes UTC parts only.
 */

/** `YYYY-MM-DD`, the wire format for every date field in this app. */
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function toUtcMidnight(value: string | Date): Date {
  const date = typeof value === "string" ? new Date(`${value}T00:00:00.000Z`) : value;
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0),
  );
}

export function toIsoDate(date: Date): string {
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDaysUtc(date: Date, days: number): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days, 0, 0, 0, 0),
  );
}

/**
 * Always anchored on `start`'s day of month, never on the previous result.
 * Stepping month by month from a clamped value drifts the series: Jan 31
 * would give Feb 28, then Mar 28, then Apr 28. Anchoring gives Feb 28,
 * Mar 31, Apr 30 — the dates a monthly plan starting on the 31st means.
 */
export function addMonthsUtc(start: Date, months: number): Date {
  const targetMonthIndex = start.getUTCMonth() + months;
  const year = start.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
  const month = ((targetMonthIndex % 12) + 12) % 12;
  // Day 0 of the following month is the last day of this one.
  const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(start.getUTCDate(), lastDayOfMonth), 0, 0, 0, 0));
}
