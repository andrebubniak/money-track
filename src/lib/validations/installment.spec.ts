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

const firstIssue = (schema: { safeParse: (v: unknown) => unknown }, values: unknown) => {
  const result = schema.safeParse(values) as
    | { success: true }
    | { success: false; error: { issues: { message: string; path: (string | number)[] }[] } };
  if (result.success) throw new Error("expected the payload to fail validation");
  return result.error.issues[0];
};

describe("createRecurringTransactionSchema", () => {
  const schema = createRecurringTransactionSchema(t);

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

  it("carries the income/card rule over from the shared fields", () => {
    expect(firstIssue(schema, { ...base, type: "INCOME" }).path).toEqual(["cardId"]);
  });

  it("has no occurrence count — an ongoing recurrence runs until deleted", () => {
    const result = schema.safeParse({ ...base, occurrencesCount: 12 });
    expect(result.success && "occurrencesCount" in result.data).toBe(false);
  });
});

describe("createInstallmentSchema", () => {
  const schema = createInstallmentSchema(t);

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
});

describe("createInstallmentSeriesSchema", () => {
  const schema = createInstallmentSeriesSchema(t);

  // Only the fields that classify the whole series. Amount, date, description
  // and paid belong to each occurrence and are edited row by row.
  it("accepts just type, category, and card", () => {
    expect(
      schema.safeParse({
        type: "EXPENSE",
        categoryId: "clx0000000000000000000001",
        cardId: "clx0000000000000000000002",
      }).success,
    ).toBe(true);
  });

  it("keeps the income/card rule", () => {
    const issue = firstIssue(schema, {
      type: "INCOME",
      categoryId: "clx0000000000000000000001",
      cardId: "clx0000000000000000000002",
    });
    expect(issue.message).toBe("card.notForIncome");
    expect(issue.path).toEqual(["cardId"]);
  });
});
