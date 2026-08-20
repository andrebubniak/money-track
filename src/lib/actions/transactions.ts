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
