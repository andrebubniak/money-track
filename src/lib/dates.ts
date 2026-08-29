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

/**
 * The latest day a payment may be dated: the *earlier* of today and the
 * transaction's own date. A payment cannot postdate the transaction it
 * settles, and `createTransactionSchema` caps `paymentDate` at today
 * regardless of how far into the future `date` itself is allowed to run.
 *
 * That second half is the whole reason this exists. An installment plan's
 * occurrences are generated months ahead, so the old checkbox — which
 * marked a row paid by copying the row's own `date` into `paymentDate` —
 * produced a future-dated payment on every unpaid row of a fresh plan (11 of
 * 12 in a yearly one) and failed `paymentDate.notInFuture` before the save
 * ever left the browser. Taking the earlier of the two is always satisfiable.
 *
 * The cap belongs here, on `paymentDate`, and *never* on `date`: a
 * future-dated occurrence is exactly what a plan is made of, and the
 * occurrence schema deliberately widens `date`'s ceiling to
 * `MAX_TRANSACTION_DATE` for that reason.
 *
 * Both arguments are `YYYY-MM-DD`, where a plain string `<` is already a
 * correct date comparison — no parsing, so no timezone to get wrong.
 */
export function paymentDateCeiling(date: string, today: string): string {
  return date < today ? date : today;
}
