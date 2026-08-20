import { z } from "zod";

import { ISO_DATE_PATTERN, toIsoDate } from "@/lib/dates";

export const MAX_TRANSACTION_DESCRIPTION_LENGTH = 200;

/**
 * The `Decimal(12, 2)` ceiling, as a string. Kept as a string so the bound,
 * the message, and the stored value are all the same lossless representation
 * — money never becomes a float on the way through this app.
 */
export const MAX_TRANSACTION_AMOUNT = "9999999999.99";

/** A `@default(cuid())` id is 25 characters; 30 leaves headroom. */
export const TRANSACTION_ID_MAX_LENGTH = 30;

/**
 * A typo'd year would otherwise write a row that sorts to one end of every
 * list forever, and no filter window would ever contain it.
 */
export const MIN_TRANSACTION_DATE = "2000-01-01";
export const MAX_TRANSACTION_DATE = "2100-12-31";

/** The only two values `Transaction.type` may hold. */
export const TRANSACTION_TYPES = ["INCOME", "EXPENSE"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

/**
 * Every message key these schemas can emit, relative to the
 * `validation.transactions` namespace. Declaring the union explicitly is what
 * lets a real `getTranslations("validation.transactions")` be passed in —
 * see the long note on `CategoryPresetTranslator` in
 * `src/lib/category-display.ts` for why a `(key: string) => string` would not
 * be assignable.
 */
export type TransactionValidationKey =
  | "amount.invalid"
  | "amount.tooSmall"
  | "amount.tooLarge"
  | "category.required"
  | "card.invalid"
  | "card.notForIncome"
  | "description.tooLong"
  | "type.invalid"
  | "date.invalid"
  | "date.outOfRange"
  | "date.notInFuture"
  | "date.beforePrevious"
  | "paymentDate.invalid"
  | "paymentDate.notInFuture"
  | "paymentDate.afterDate"
  | "frequency.invalid"
  | "occurrences.invalid"
  | "occurrences.tooMany";

export type TransactionValidationTranslator = (
  key: TransactionValidationKey,
  values?: Record<string, string | number>,
) => string;

/**
 * A `YYYY-MM-DD` field. String comparison is a correct date comparison for
 * this format, so the range check needs no parsing. The second refinement
 * catches a well-shaped but nonexistent day like `2026-02-31`: contrary to
 * what a strict-ISO-parsing `Date` constructor would do, JS's `Date` silently
 * rolls an overflowing day into the next month instead of producing `NaN`
 * (`new Date("2026-02-31T00:00:00.000Z")` is `2026-03-03`), so the check
 * round-trips the parsed date back through `toIsoDate` and compares it to
 * the original string rather than trusting `getTime()` alone.
 *
 * `maxDate` narrows the upper bound below `MAX_TRANSACTION_DATE` — a
 * server-computed "today" for the fields that may not be in the future. The
 * message says *why* rather than restating the range.
 *
 * `messageKey` is what lets the payment-date field report its own messages
 * rather than the transaction date's.
 */
export function isoDateField(
  t: TransactionValidationTranslator,
  maxDate: string = MAX_TRANSACTION_DATE,
  messageKey: {
    invalid: TransactionValidationKey;
    notInFuture: TransactionValidationKey;
  } = {
    invalid: "date.invalid",
    notInFuture: "date.notInFuture",
  },
) {
  return z
    .string()
    .trim()
    .regex(ISO_DATE_PATTERN, t(messageKey.invalid))
    .refine((value) => {
      const date = new Date(`${value}T00:00:00.000Z`);
      return !Number.isNaN(date.getTime()) && toIsoDate(date) === value;
    }, t(messageKey.invalid))
    .refine(
      (value) => value >= MIN_TRANSACTION_DATE && value <= MAX_TRANSACTION_DATE,
      t("date.outOfRange", { min: MIN_TRANSACTION_DATE, max: MAX_TRANSACTION_DATE }),
    )
    .refine((value) => value <= maxDate, t(messageKey.notInFuture));
}

/** The fields common to one-off transactions, recurrences, and installments. */
export function sharedTransactionFields(t: TransactionValidationTranslator) {
  return {
    type: z.enum(TRANSACTION_TYPES, t("type.invalid")),

    // Validated as a string and kept as one all the way to Prisma, which
    // accepts a string for a Decimal column. Parsing to a number here would
    // put a float between the user's input and the database.
    amount: z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,2})?$/, t("amount.invalid"))
      .refine((value) => Number(value) > 0, t("amount.tooSmall"))
      .refine(
        (value) => Number(value) <= Number(MAX_TRANSACTION_AMOUNT),
        t("amount.tooLarge", { max: MAX_TRANSACTION_AMOUNT }),
      ),

    categoryId: z
      .string()
      .trim()
      .min(1, t("category.required"))
      .max(TRANSACTION_ID_MAX_LENGTH, t("category.required")),

    // Accepts a string, null, or nothing at all, and always produces
    // `string | null` — so a cleared select and an untouched one are the
    // same value by the time anything downstream sees it.
    cardId: z
      .union([z.string().trim().max(TRANSACTION_ID_MAX_LENGTH, t("card.invalid")), z.null()])
      .optional()
      .transform((value) => (value ? value : null)),

    // `.nullish()`, not `.optional()`: every create page's `defaultValues`
    // sets this to `null` (matching `TransactionValues.description`'s own
    // `string | null` type), and react-hook-form submits that raw `null`
    // unchanged for a field the user never touched. `.optional()` alone only
    // widens the input type to accept `undefined` — a literal `null` still
    // fails zod's base `z.string()` check before `.trim()`/`.max()` ever run,
    // surfacing as an untranslated "Invalid input: expected string, received
    // null" instead of submitting. `cardId` above already accepts `null` for
    // the identical reason; this mirrors it.
    description: z
      .string()
      .trim()
      .max(
        MAX_TRANSACTION_DESCRIPTION_LENGTH,
        t("description.tooLong", { max: MAX_TRANSACTION_DESCRIPTION_LENGTH }),
      )
      .nullish()
      .transform((value) => (value ? value : null)),
  };
}

/**
 * `Transaction.cardId` is null exactly when the type is `INCOME`. Guarded, so
 * a payload that already failed the base shape does not also collect this
 * issue — `.claude/rules/validation.md`.
 *
 * Two guards, for two different ways the base shape can already have failed:
 *
 * - When `type` itself is outside the enum, zod never runs this refinement
 *   at all — the object-level `superRefine` short-circuits once a field it
 *   reads has failed its own check — so no explicit `type` guard is needed
 *   here for that case.
 * - When `cardId` is independently invalid (over `TRANSACTION_ID_MAX_LENGTH`),
 *   zod *does* still run this refinement, and the raw, untransformed, still
 *   over-length string reaches `values.cardId` — truthy, so the naive
 *   `values.cardId` check alone would add `card.notForIncome` on top of the
 *   field's own `too_big` issue, both on `path: ["cardId"]`. The explicit
 *   length check below is what skips that case, so an over-length `cardId`
 *   on an income transaction still yields exactly one issue.
 */
export function incomeHasNoCard(t: TransactionValidationTranslator) {
  return (values: { type: TransactionType; cardId: string | null }, ctx: z.RefinementCtx) => {
    if (
      values.type === "INCOME" &&
      values.cardId &&
      values.cardId.length <= TRANSACTION_ID_MAX_LENGTH
    ) {
      ctx.addIssue({ code: "custom", message: t("card.notForIncome"), path: ["cardId"] });
    }
  };
}

/**
 * A payment cannot postdate its transaction. Both values are `YYYY-MM-DD`,
 * for which string comparison is a correct date comparison — but *only* for
 * that shape, which is what the guard below is really protecting.
 *
 * Guarded so a payload whose `date` or `paymentDate` already failed its own
 * check does not also collect this issue on the same path —
 * `.claude/rules/validation.md`. The shape re-check is the same move
 * `incomeHasNoCard` makes for `cardId`'s length: an object-level
 * `superRefine` still runs when a *string* field only failed its own
 * `.refine()`s (the value is still a string, so the object's shape parsed),
 * so the raw, still-malformed value reaches here. Comparing it as a string
 * is meaningless, and actively wrong — `"not-a-date" > "2026-08-10"` is
 * `true`, which would stack `paymentDate.afterDate` on top of
 * `paymentDate.invalid`, both on `["paymentDate"]`.
 */
export function paymentDateNotAfterDate(t: TransactionValidationTranslator) {
  return (values: { date: string; paymentDate: string | null }, ctx: z.RefinementCtx) => {
    if (!ISO_DATE_PATTERN.test(values.date)) return;
    if (!values.paymentDate || !ISO_DATE_PATTERN.test(values.paymentDate)) return;

    if (values.paymentDate > values.date) {
      ctx.addIssue({
        code: "custom",
        message: t("paymentDate.afterDate"),
        path: ["paymentDate"],
      });
    }
  };
}

/**
 * `today` is always supplied by the server — a client-side `new Date()`
 * could sit a day either side of the server's across a timezone boundary
 * and disagree with the action about what "today" is.
 *
 * `maxDate` widens the ceiling back to `MAX_TRANSACTION_DATE` for an
 * installment plan's generated occurrences, which are legitimately
 * future-dated. `updateTransaction` picks it from the row itself.
 */
export function createTransactionSchema(
  t: TransactionValidationTranslator,
  options: { today: string; maxDate?: string },
) {
  return z
    .object({
      ...sharedTransactionFields(t),
      date: isoDateField(t, options.maxDate ?? options.today),
      paymentDate: isoDateField(t, options.today, {
        invalid: "paymentDate.invalid",
        notInFuture: "paymentDate.notInFuture",
      }).nullable(),
    })
    .superRefine(incomeHasNoCard(t))
    .superRefine(paymentDateNotAfterDate(t));
}

export type TransactionValues = z.infer<ReturnType<typeof createTransactionSchema>>;
