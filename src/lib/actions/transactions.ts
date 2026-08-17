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
import { toUtcMidnight } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import {
  createTransactionSchema,
  type TransactionValues,
} from "@/lib/validations/transaction";

async function parseValues(values: TransactionValues, locale: string) {
  const t = await getTranslations({
    locale: resolveLocale(locale),
    namespace: "validation.transactions",
  });
  return createTransactionSchema(t).safeParse(values);
}

export async function createTransaction(
  values: TransactionValues,
  locale: string,
): Promise<ActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return notFoundError(locale);

  const parsed = await parseValues(values, locale);
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
      isPaid: parsed.data.isPaid,
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

  const parsed = await parseValues(values, locale);
  if (!parsed.success) return invalidInputError(locale);

  if (!(await ownsReferences(userId, parsed.data.categoryId, parsed.data.cardId))) {
    return invalidInputError(locale);
  }

  const transaction = await prisma.transaction.findFirst({ where: { id, userId } });
  if (!transaction) return notFoundError(locale);

  await prisma.transaction.update({
    where: { id },
    data: {
      categoryId: parsed.data.categoryId,
      cardId: parsed.data.cardId,
      type: parsed.data.type,
      amount: parsed.data.amount,
      description: parsed.data.description,
      date: toUtcMidnight(parsed.data.date),
      isPaid: parsed.data.isPaid,
    },
  });

  revalidatePath("/[locale]/transactions", "page");
  return { success: true };
}

export async function deleteTransaction(id: string, locale: string): Promise<ActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return notFoundError(locale);
  if (!transactionIdSchema.safeParse(id).success) return notFoundError(locale);

  const transaction = await prisma.transaction.findFirst({ where: { id, userId } });
  if (!transaction) return notFoundError(locale);

  // Soft delete, never a hard one — this row is financial history, and
  // `Category`/`Card` reference it with `onDelete: Restrict`.
  await prisma.transaction.update({ where: { id }, data: { deactivatedAt: new Date() } });

  revalidatePath("/[locale]/transactions", "page");
  return { success: true };
}
