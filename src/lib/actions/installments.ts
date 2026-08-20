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
import { occurrenceDates } from "@/lib/transactions/occurrences";
import {
  createInstallmentSchema,
  createInstallmentSeriesSchema,
  type InstallmentSeriesValues,
  type InstallmentValues,
} from "@/lib/validations/installment";

async function parseValues(values: InstallmentValues, locale: string, today: string) {
  const t = await getTranslations({
    locale: resolveLocale(locale),
    namespace: "validation.transactions",
  });
  return createInstallmentSchema(t, today).safeParse(values);
}

async function parseSeriesValues(values: InstallmentSeriesValues, locale: string) {
  const t = await getTranslations({
    locale: resolveLocale(locale),
    namespace: "validation.transactions",
  });
  return createInstallmentSeriesSchema(t).safeParse(values);
}

/**
 * Writes the definition and all of its rows in one database transaction: a
 * plan that half-exists is worse than one that failed outright.
 */
export async function createInstallmentPlan(
  values: InstallmentValues,
  locale: string,
): Promise<ActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return notFoundError(locale);

  const today = toIsoDate(new Date());
  const parsed = await parseValues(values, locale, today);
  if (!parsed.success) return invalidInputError(locale);

  if (!(await ownsReferences(userId, parsed.data.categoryId, parsed.data.cardId))) {
    return invalidInputError(locale);
  }

  const dates = occurrenceDates(
    parsed.data.startDate,
    parsed.data.frequency,
    parsed.data.occurrencesCount,
  );

  await prisma.$transaction(async (client) => {
    const plan = await client.recurringTransaction.create({
      data: {
        userId,
        categoryId: parsed.data.categoryId,
        cardId: parsed.data.cardId,
        type: parsed.data.type,
        amount: parsed.data.amount,
        description: parsed.data.description,
        frequency: parsed.data.frequency,
        startDate: toUtcMidnight(parsed.data.startDate),
        // Closed series: the count is final and there is nothing left for a
        // cron to run, so `nextRunDate` stays null.
        fixedOccurrencesCount: true,
        occurrencesCount: parsed.data.occurrencesCount,
        nextRunDate: null,
      },
    });

    await client.transaction.createMany({
      data: dates.map((date) => ({
        userId,
        categoryId: parsed.data.categoryId,
        cardId: parsed.data.cardId,
        type: parsed.data.type,
        amount: parsed.data.amount,
        description: parsed.data.description,
        date,
        // `paymentDate` is left unset: it defaults to null, so every
        // generated occurrence starts unpaid.
        recurringTransactionId: plan.id,
      })),
    });
  });

  revalidatePath("/[locale]/transactions", "page");
  return { success: true };
}

/**
 * The series half of the plan edit page. `amount`, `date`, `description`,
 * and `paymentDate` are deliberately absent: those belong to each occurrence
 * and are edited row by row through `updateTransaction`.
 */
export async function updateInstallmentSeries(
  id: string,
  values: InstallmentSeriesValues,
  locale: string,
): Promise<ActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return notFoundError(locale);
  if (!transactionIdSchema.safeParse(id).success) return notFoundError(locale);

  const parsed = await parseSeriesValues(values, locale);
  if (!parsed.success) return invalidInputError(locale);

  if (!(await ownsReferences(userId, parsed.data.categoryId, parsed.data.cardId))) {
    return invalidInputError(locale);
  }

  // Every ownership lookup for a plan carries `fixedOccurrencesCount: true`,
  // so an ongoing recurrence's id gets the same generic not-found error as
  // another user's id — that one is edited through its own action.
  // `deactivatedAt: null` excludes a soft-deleted plan for the same reason
  // `updateTransaction` excludes a soft-deleted transaction — without it, a
  // forged or replayed request could still write to a plan the user already
  // deleted.
  const plan = await prisma.recurringTransaction.findFirst({
    where: { id, userId, fixedOccurrencesCount: true, deactivatedAt: null },
  });
  if (!plan) return notFoundError(locale);

  const seriesFields = {
    categoryId: parsed.data.categoryId,
    cardId: parsed.data.cardId,
    type: parsed.data.type,
  };

  await prisma.$transaction(async (client) => {
    await client.recurringTransaction.update({ where: { id }, data: seriesFields });
    await client.transaction.updateMany({
      where: { recurringTransactionId: id, deactivatedAt: null },
      data: seriesFields,
    });
  });

  revalidatePath("/[locale]/transactions", "page");
  return { success: true };
}

/**
 * Unlike an ongoing recurrence, a plan's occurrences *are* how it appears in
 * the list — soft-deleting only the definition would remove nothing the user
 * can see.
 */
export async function deleteInstallmentPlan(id: string, locale: string): Promise<ActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return notFoundError(locale);
  if (!transactionIdSchema.safeParse(id).success) return notFoundError(locale);

  // `deactivatedAt: null` excludes an already-deleted plan, so re-deleting it
  // can't overwrite its original `deactivatedAt` with a fresh timestamp.
  const plan = await prisma.recurringTransaction.findFirst({
    where: { id, userId, fixedOccurrencesCount: true, deactivatedAt: null },
  });
  if (!plan) return notFoundError(locale);

  const deactivatedAt = new Date();

  await prisma.$transaction(async (client) => {
    await client.recurringTransaction.update({ where: { id }, data: { deactivatedAt } });
    await client.transaction.updateMany({
      where: { recurringTransactionId: id, deactivatedAt: null },
      data: { deactivatedAt },
    });
  });

  revalidatePath("/[locale]/transactions", "page");
  return { success: true };
}
