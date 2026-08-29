import { describe, expect, it } from "vitest";

import { MAX_INSTALLMENT_OCCURRENCES } from "@/lib/transactions/occurrences";
import { createRecurringTransactionSchema } from "@/lib/validations/recurring-transaction";
import {
  createInstallmentSchema,
  createInstallmentSeriesSchema,
} from "@/lib/validations/installment";
import type { TransactionValidationKey } from "@/lib/validations/transaction";

const t = (key: TransactionValidationKey, values?: Record<string, string | number>) =>
  values ? `${key}:${JSON.stringify(values)}` : key;

const base = {
  type: "EXPENSE" as const,
  amount: "89.00",
  categoryId: "clx0000000000000000000001",
  cardId: "clx0000000000000000000002",
  description: "Gym",
  startDate: "2026-01-05",
  frequency: "MONTHLY" as const,
};

/**
 * Well after every `startDate` in the `base` fixture, so the "not in the
 * future" ceiling never fires for the tests that are not about it. The two
 * that *are* about it pass `TOMORROW` explicitly.
 */
const TODAY = "2026-08-19";
const TOMORROW = "2026-08-20";

const firstIssue = (schema: { safeParse: (v: unknown) => unknown }, values: unknown) => {
  const result = schema.safeParse(values) as
    | { success: true }
    | { success: false; error: { issues: { message: string; path: (string | number)[] }[] } };
  if (result.success) throw new Error("expected the payload to fail validation");
  return result.error.issues[0];
};

describe("createRecurringTransactionSchema", () => {
  const schema = createRecurringTransactionSchema(t, TODAY);

  it("accepts a complete payload", () => {
    expect(schema.safeParse(base).success).toBe(true);
  });

  it("accepts every frequency the database allows", () => {
    for (const frequency of [
      "DAILY",
      "WEEKLY",
      "BIWEEKLY",
      "MONTHLY",
      "QUARTERLY",
      "SEMIANNUAL",
      "YEARLY",
    ]) {
      expect(schema.safeParse({ ...base, frequency }).success).toBe(true);
    }
  });

  it("rejects a frequency outside the enum", () => {
    expect(firstIssue(schema, { ...base, frequency: "FORTNIGHTLY" }).message).toBe(
      "frequency.invalid",
    );
  });

  it("applies the date range to startDate", () => {
    expect(firstIssue(schema, { ...base, startDate: "1999-12-31" }).message).toContain(
      "date.outOfRange",
    );
  });

  // The ceiling `today` supplies, not the absolute `MAX_TRANSACTION_DATE`
  // range above: a recurrence may not be scheduled to have started tomorrow.
  it("rejects a startDate in the future", () => {
    expect(firstIssue(schema, { ...base, startDate: TOMORROW }).message).toBe("date.notInFuture");
  });

  it("accepts a startDate of today", () => {
    expect(schema.safeParse({ ...base, startDate: TODAY }).success).toBe(true);
  });

  it("carries the income/card rule over from the shared fields", () => {
    expect(firstIssue(schema, { ...base, type: "INCOME" }).path).toEqual(["cardId"]);
  });

  it("has no occurrence count — an ongoing recurrence runs until deleted", () => {
    const result = schema.safeParse({ ...base, occurrencesCount: 12 });
    expect(result.success && "occurrencesCount" in result.data).toBe(false);
  });
});

describe("createInstallmentSchema", () => {
  const schema = createInstallmentSchema(t, TODAY);

  it("accepts a plan with a count", () => {
    expect(schema.safeParse({ ...base, occurrencesCount: 12 }).success).toBe(true);
  });

  it("coerces the count from the string a number input produces", () => {
    const result = schema.safeParse({ ...base, occurrencesCount: "12" });
    expect(result.success && result.data.occurrencesCount).toBe(12);
  });

  it("accepts 1 and the maximum, and rejects 0 and one over", () => {
    expect(schema.safeParse({ ...base, occurrencesCount: 1 }).success).toBe(true);
    expect(
      schema.safeParse({ ...base, occurrencesCount: MAX_INSTALLMENT_OCCURRENCES }).success,
    ).toBe(true);
    expect(firstIssue(schema, { ...base, occurrencesCount: 0 }).message).toBe(
      "occurrences.invalid",
    );
    expect(
      firstIssue(schema, { ...base, occurrencesCount: MAX_INSTALLMENT_OCCURRENCES + 1 }).message,
    ).toContain("occurrences.tooMany");
  });

  it("rejects a fractional count", () => {
    expect(firstIssue(schema, { ...base, occurrencesCount: 2.5 }).message).toBe(
      "occurrences.invalid",
    );
  });

  // A plan's *generated occurrences* are legitimately future-dated, but the
  // plan itself may not start in the future — the occurrences get their own
  // widened ceiling in `createTransactionSchema`, not this one.
  it("rejects a startDate in the future", () => {
    expect(
      firstIssue(schema, { ...base, startDate: TOMORROW, occurrencesCount: 12 }).message,
    ).toBe("date.notInFuture");
  });

  it("accepts a startDate of today", () => {
    expect(
      schema.safeParse({ ...base, startDate: TODAY, occurrencesCount: 12 }).success,
    ).toBe(true);
  });
});

describe("createInstallmentSeriesSchema", () => {
  const schema = createInstallmentSeriesSchema(t);

  const seriesBase = {
    type: "EXPENSE" as const,
    categoryId: "clx0000000000000000000001",
    cardId: "clx0000000000000000000002",
    description: "Gym",
  };

  // Only the fields that classify the whole series. Amount, date, and payment
  // date belong to each occurrence and are edited row by row.
  it("accepts type, category, card, and description", () => {
    expect(schema.safeParse(seriesBase).success).toBe(true);
  });

  // Adopted from `sharedTransactionFields` rather than redeclared, so the
  // bound, the trimming, and the `null` handling cannot drift from the
  // per-transaction description's.
  it("carries the shared description field's trimming, null handling, and bound", () => {
    const trimmed = schema.safeParse({ ...seriesBase, description: "  Gym  " });
    expect(trimmed.success && trimmed.data.description).toBe("Gym");

    const cleared = schema.safeParse({ ...seriesBase, description: null });
    expect(cleared.success && cleared.data.description).toBeNull();

    expect(
      firstIssue(schema, { ...seriesBase, description: "x".repeat(201) }).message,
    ).toContain("description.tooLong");
  });

  it("keeps the income/card rule", () => {
    const issue = firstIssue(schema, { ...seriesBase, type: "INCOME" });
    expect(issue.message).toBe("card.notForIncome");
    expect(issue.path).toEqual(["cardId"]);
  });
});
