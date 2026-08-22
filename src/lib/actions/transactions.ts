"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import {
  getSessionUserId,
  invalidInputError,
  notFoundError,
  resolveLocale,
  transactionIdSchema,
  type ActionResult,
} from "@/lib/actions/action-helpers";
import { ownsReferences } from "@/lib/actions/references";
import { toIsoDate, toUtcMidnight } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import {
  createTransactionSchema,
  MAX_TRANSACTION_DATE,
  type TransactionValues,
} from "@/lib/validations/transaction";

async function parseValues(
  values: TransactionValues,
  locale: string,
  options: { today: string; maxDate?: string },
) {
  const t = await getTranslations({
    locale: resolveLocale(locale),
    namespace: "validation.transactions",
  });
  return createTransactionSchema(t, options).safeParse(values);
}

/**
 * Unlike `invalidInputError` this names the rule that failed. Safe to
 * surface: the client enforces the same rule from the values already on
 * screen, so the message reveals nothing about rows the user cannot
 * already see — and a generic "invalid input" here would be actively
 * unhelpful, since nothing about the payload itself is malformed.
 */
async function ruleError(
  key: "date.beforePrevious",
  locale: string,
): Promise<ActionResult> {
  const t = await getTranslations({
    locale: resolveLocale(locale),
    namespace: "validation.transactions",
  });
  return { success: false, error: t(key) };
}

export async function createTransaction(
  values: TransactionValues,
  locale: string,
): Promise<ActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return notFoundError(locale);

  // A one-off is always capped at today: there is no legitimate reason to
  // record a transaction that has not happened yet.
  const today = toIsoDate(new Date());
  const parsed = await parseValues(values, locale, { today });
  if (!parsed.success) return invalidInputError(locale);

  if (!(await ownsReferences(userId, parsed.data.categoryId, parsed.data.cardId))) {
    return invalidInputError(locale);
  }

  await prisma.transaction.create({
    data: {
      userId,
      categoryId: parsed.data.categoryId,
      cardId: parsed.data.cardId,
      type: parsed.data.type,
      // A string, straight into the Decimal column: money never becomes a float.
      amount: parsed.data.amount,
      description: parsed.data.description,
      date: toUtcMidnight(parsed.data.date),
      paymentDate: parsed.data.paymentDate ? toUtcMidnight(parsed.data.paymentDate) : null,
    },
  });

  revalidatePath("/[locale]/transactions", "page");
  return { success: true };
}

/**
 * Also the action the installment occurrences table calls. A generated row is
 * updated here exactly like a one-off — its `recurringTransactionId` is left
 * alone, so it stays part of its series.
 */
export async function updateTransaction(
  id: string,
  values: TransactionValues,
  locale: string,
): Promise<ActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return notFoundError(locale);
  if (!transactionIdSchema.safeParse(id).success) return notFoundError(locale);

  // Looked up before parsing, not after: the date ceiling depends on what
  // kind of row this is. `deactivatedAt: null` excludes a soft-deleted row
  // — without it, a forged or replayed request could still write to a
  // transaction the user already deleted. Installment occurrences generated
  // by a recurrence are always live (`deactivatedAt: null`) when this action
  // is the one editing them, so the guard doesn't affect that path.
  const transaction = await prisma.transaction.findFirst({
    where: { id, userId, deactivatedAt: null },
  });
  if (!transaction) return notFoundError(locale);

  const today = toIsoDate(new Date());
  // A plan's occurrences are generated into the future by design, so
  // capping them at today would make every one of them unsavable from the
  // moment the plan is created.
  const parsed = await parseValues(values, locale, {
    today,
    maxDate: transaction.recurringTransactionId ? MAX_TRANSACTION_DATE : undefined,
  });
  if (!parsed.success) return invalidInputError(locale);

  if (!(await ownsReferences(userId, parsed.data.categoryId, parsed.data.cardId))) {
    return invalidInputError(locale);
  }

  // A plan's occurrences must stay in order. Only the "not before the
  // previous one" half is enforced: saving is per row, so also requiring
  // "not after the next one" would deadlock a legitimate reshuffle —
  // moving [Jan, Feb, Mar] to [Jan, Apr, May] has no valid one-row-at-a-time
  // path. The client blocks the broken intermediate state from being
  // reached; a forged request can only break the chain in the direction that
  // has to stay open anyway.
  //
  // The `id` tie-break matters: a plan generated on a daily frequency can
  // hold several occurrences on the same date, and `date` alone would not
  // give a stable predecessor. It cannot be `createdAt`: that column defaults
  // to `CURRENT_TIMESTAMP`, which Postgres evaluates once at *transaction
  // start*, so every row of the single `createMany` that generates a plan
  // carries the same timestamp to the microsecond — two same-date siblings
  // would each fail to be the other's predecessor and neither would anchor
  // the rule. `id` is a cuid, distinct per row by construction, and it is the
  // tie-break `list-query.ts` (`ORDER BY t.date, t.id`) and the occurrences
  // editor already order by, so all three agree on which row is which.
  if (transaction.recurringTransactionId) {
    const previous = await prisma.transaction.findFirst({
      where: {
        recurringTransactionId: transaction.recurringTransactionId,
        deactivatedAt: null,
        id: { not: id },
        OR: [
          { date: { lt: transaction.date } },
          { date: transaction.date, id: { lt: transaction.id } },
        ],
      },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      select: { date: true },
    });

    if (previous && toUtcMidnight(parsed.data.date) < previous.date) {
      return ruleError("date.beforePrevious", locale);
    }
  }

  await prisma.transaction.update({
    where: { id },
    data: {
      categoryId: parsed.data.categoryId,
      cardId: parsed.data.cardId,
      type: parsed.data.type,
      amount: parsed.data.amount,
      description: parsed.data.description,
      date: toUtcMidnight(parsed.data.date),
      paymentDate: parsed.data.paymentDate ? toUtcMidnight(parsed.data.paymentDate) : null,
    },
  });

  revalidatePath("/[locale]/transactions", "page");
  return { success: true };
}

export async function deleteTransaction(id: string, locale: string): Promise<ActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return notFoundError(locale);
  if (!transactionIdSchema.safeParse(id).success) return notFoundError(locale);

  // `deactivatedAt: null` excludes an already-deleted transaction, so
  // re-deleting it can't overwrite its original `deactivatedAt` with a fresh
  // timestamp.
  const transaction = await prisma.transaction.findFirst({ where: { id, userId, deactivatedAt: null } });
  if (!transaction) return notFoundError(locale);

  // Soft delete, never a hard one — this row is financial history, and
  // `Category`/`Card` reference it with `onDelete: Restrict`.
  await prisma.transaction.update({ where: { id }, data: { deactivatedAt: new Date() } });

  revalidatePath("/[locale]/transactions", "page");
  return { success: true };
}
