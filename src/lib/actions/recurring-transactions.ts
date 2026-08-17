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
  createRecurringTransactionSchema,
  type RecurringTransactionValues,
} from "@/lib/validations/recurring-transaction";

async function parseValues(values: RecurringTransactionValues, locale: string) {
  const t = await getTranslations({
    locale: resolveLocale(locale),
    namespace: "validation.transactions",
  });
  return createRecurringTransactionSchema(t).safeParse(values);
}

export async function createRecurringTransaction(
  values: RecurringTransactionValues,
  locale: string,
): Promise<ActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return notFoundError(locale);

  const parsed = await parseValues(values, locale);
  if (!parsed.success) return invalidInputError(locale);

  if (!(await ownsReferences(userId, parsed.data.categoryId, parsed.data.cardId))) {
    return invalidInputError(locale);
  }

  const startDate = toUtcMidnight(parsed.data.startDate);

  await prisma.recurringTransaction.create({
    data: {
      userId,
      categoryId: parsed.data.categoryId,
      cardId: parsed.data.cardId,
      type: parsed.data.type,
      amount: parsed.data.amount,
      description: parsed.data.description,
      frequency: parsed.data.frequency,
      startDate,
      // Ongoing: nothing is generated here, so the count starts at zero and
      // `nextRunDate` carries the first due date for the cron that will grow
      // this series later.
      fixedOccurrencesCount: false,
      occurrencesCount: 0,
      nextRunDate: startDate,
    },
  });

  revalidatePath("/[locale]/transactions", "page");
  return { success: true };
}

export async function updateRecurringTransaction(
  id: string,
  values: RecurringTransactionValues,
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

  // An installment plan is edited through its own action, which also
  // rewrites its generated rows. Editing one here would change the
  // definition and silently leave every occurrence behind — checked twice,
  // once in the query and once on the row, so a plan can never slip through.
  const recurring = await prisma.recurringTransaction.findFirst({
    where: { id, userId, fixedOccurrencesCount: false },
  });
  if (!recurring || recurring.fixedOccurrencesCount) return notFoundError(locale);

  const startDate = toUtcMidnight(parsed.data.startDate);

  await prisma.recurringTransaction.update({
    where: { id },
    data: {
      categoryId: parsed.data.categoryId,
      cardId: parsed.data.cardId,
      type: parsed.data.type,
      amount: parsed.data.amount,
      description: parsed.data.description,
      frequency: parsed.data.frequency,
      startDate,
      nextRunDate: startDate,
    },
  });

  revalidatePath("/[locale]/transactions", "page");
  return { success: true };
}

export async function deleteRecurringTransaction(
  id: string,
  locale: string,
): Promise<ActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return notFoundError(locale);
  if (!transactionIdSchema.safeParse(id).success) return notFoundError(locale);

  const recurring = await prisma.recurringTransaction.findFirst({
    where: { id, userId, fixedOccurrencesCount: false },
  });
  if (!recurring || recurring.fixedOccurrencesCount) return notFoundError(locale);

  // Only the definition. Any rows it generated stay as history — that is
  // what `onDelete: SetNull` on `Transaction.recurringTransactionId` is for,
  // and nothing here is hard-deleted anyway.
  await prisma.recurringTransaction.update({
    where: { id },
    data: { deactivatedAt: new Date() },
  });

  revalidatePath("/[locale]/transactions", "page");
  return { success: true };
}
