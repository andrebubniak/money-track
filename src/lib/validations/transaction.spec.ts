import { describe, expect, it } from "vitest";

import {
  createTransactionSchema,
  MAX_TRANSACTION_DESCRIPTION_LENGTH,
  TRANSACTION_ID_MAX_LENGTH,
  type TransactionValidationKey,
} from "@/lib/validations/transaction";

// Key-echoing stub, per .claude/rules/i18n.md: these tests assert which rule
// fired, not the copy, so changing an English string cannot break them.
const t = (key: TransactionValidationKey, values?: Record<string, string | number>) =>
  values ? `${key}:${JSON.stringify(values)}` : key;

const schema = createTransactionSchema(t);

const valid = {
  type: "EXPENSE" as const,
  amount: "120.50",
  categoryId: "clx0000000000000000000001",
  cardId: "clx0000000000000000000002",
  description: "Groceries",
  date: "2026-08-14",
  isPaid: true,
};

const firstIssue = (values: unknown) => {
  const result = schema.safeParse(values);
  if (result.success) throw new Error("expected the payload to fail validation");
  return result.error.issues[0];
};

describe("createTransactionSchema", () => {
  it("accepts a complete payload", () => {
    expect(schema.safeParse(valid).success).toBe(true);
  });

  describe("amount", () => {
    it("accepts a whole number and one or two decimal places", () => {
      for (const amount of ["40", "40.5", "40.55"]) {
        expect(schema.safeParse({ ...valid, amount }).success).toBe(true);
      }
    });

    it("rejects three decimal places", () => {
      expect(firstIssue({ ...valid, amount: "40.555" }).message).toBe("amount.invalid");
    });

    it("rejects a non-numeric string", () => {
      expect(firstIssue({ ...valid, amount: "twelve" }).message).toBe("amount.invalid");
    });

    it("rejects a negative amount at the pattern, before the range check", () => {
      expect(firstIssue({ ...valid, amount: "-5" }).message).toBe("amount.invalid");
    });

    it("rejects zero", () => {
      expect(firstIssue({ ...valid, amount: "0" }).message).toBe("amount.tooSmall");
    });

    it("accepts the Decimal(12, 2) ceiling and rejects one cent more", () => {
      expect(schema.safeParse({ ...valid, amount: "9999999999.99" }).success).toBe(true);
      expect(firstIssue({ ...valid, amount: "10000000000.00" }).message).toContain("amount.tooLarge");
    });
  });

  describe("category", () => {
    it("rejects an empty id", () => {
      expect(firstIssue({ ...valid, categoryId: "" }).message).toBe("category.required");
    });

    it("rejects an id longer than the bound", () => {
      expect(firstIssue({ ...valid, categoryId: "c".repeat(31) }).message).toBe("category.required");
    });
  });

  describe("card", () => {
    it("normalizes an empty string to null", () => {
      const result = schema.safeParse({ ...valid, cardId: "" });
      expect(result.success && result.data.cardId).toBeNull();
    });

    it("normalizes a missing value to null", () => {
      const { cardId: _removed, ...withoutCard } = valid;
      const result = schema.safeParse(withoutCard);
      expect(result.success && result.data.cardId).toBeNull();
    });

    // The schema's only cross-field rule, and the invariant the database
    // comment documents: cardId is null exactly when the type is INCOME.
    it("rejects a card on an income transaction, on the cardId path", () => {
      const issue = firstIssue({ ...valid, type: "INCOME" });
      expect(issue.message).toBe("card.notForIncome");
      expect(issue.path).toEqual(["cardId"]);
    });

    it("accepts income with no card", () => {
      expect(schema.safeParse({ ...valid, type: "INCOME", cardId: "" }).success).toBe(true);
    });

    // Not actually exercising the guard: zod short-circuits the object-level
    // superRefine entirely once `type` itself fails the enum check, so this
    // passes even without a `type` guard in `incomeHasNoCard`. Kept because
    // it still documents that behaviour; the guard's real coverage is the
    // over-length-cardId case below.
    it("does not add a second issue when the type itself is invalid", () => {
      const result = schema.safeParse({ ...valid, type: "TRANSFER" });
      expect(result.success).toBe(false);
      expect(result.success === false && result.error.issues).toHaveLength(1);
    });

    // This one genuinely exercises the guard: `type` is valid, so
    // `superRefine` does run, and the raw over-length cardId reaches it
    // truthy — without the length guard this would add `card.notForIncome`
    // on top of the field's own `too_big` issue, both on `["cardId"]`.
    it("does not add a second issue when cardId is independently invalid", () => {
      const result = schema.safeParse({
        ...valid,
        type: "INCOME",
        cardId: "c".repeat(TRANSACTION_ID_MAX_LENGTH + 1),
      });
      expect(result.success).toBe(false);
      expect(result.success === false && result.error.issues).toHaveLength(1);
      expect(result.success === false && result.error.issues[0].path).toEqual(["cardId"]);
    });
  });

  describe("description", () => {
    it("accepts the maximum length and rejects one more", () => {
      const max = "d".repeat(MAX_TRANSACTION_DESCRIPTION_LENGTH);
      expect(schema.safeParse({ ...valid, description: max }).success).toBe(true);
      expect(firstIssue({ ...valid, description: `${max}d` }).message).toContain(
        "description.tooLong",
      );
    });

    it("normalizes an empty description to null", () => {
      const result = schema.safeParse({ ...valid, description: "   " });
      expect(result.success && result.data.description).toBeNull();
    });

    // Regression: every create page's `defaultValues.description` is `null`
    // (matching `TransactionValues`'s own `string | null` type), and
    // react-hook-form submits that raw value unchanged for a field the user
    // never touched — so a real submission can send `null` here, not just
    // `undefined` or `""`. `.optional()` alone doesn't accept it.
    it("normalizes a null description to null, not a type error", () => {
      const result = schema.safeParse({ ...valid, description: null });
      expect(result.success && result.data.description).toBeNull();
    });

    it("normalizes a missing description to null", () => {
      const { description: _removed, ...withoutDescription } = valid;
      const result = schema.safeParse(withoutDescription);
      expect(result.success && result.data.description).toBeNull();
    });
  });

  describe("date", () => {
    it("rejects a non-ISO shape", () => {
      expect(firstIssue({ ...valid, date: "14/08/2026" }).message).toBe("date.invalid");
    });

    it("rejects a day that does not exist", () => {
      expect(firstIssue({ ...valid, date: "2026-02-31" }).message).toBe("date.invalid");
    });

    it("accepts both range boundaries and rejects outside them", () => {
      expect(schema.safeParse({ ...valid, date: "2000-01-01" }).success).toBe(true);
      expect(schema.safeParse({ ...valid, date: "2100-12-31" }).success).toBe(true);
      expect(firstIssue({ ...valid, date: "1999-12-31" }).message).toContain("date.outOfRange");
      expect(firstIssue({ ...valid, date: "2101-01-01" }).message).toContain("date.outOfRange");
    });
  });

  describe("type", () => {
    it("rejects a value outside the enum", () => {
      expect(firstIssue({ ...valid, type: "TRANSFER" }).message).toBe("type.invalid");
    });
  });
});
