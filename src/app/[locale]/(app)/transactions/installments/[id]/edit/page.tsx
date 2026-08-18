import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";

import { InstallmentOccurrencesTable } from "@/components/transactions/installment-occurrences-table";
import { InstallmentSeriesForm } from "@/components/transactions/installment-series-form";
import { Link, redirect } from "@/i18n/navigation";
import { transactionIdSchema } from "@/lib/actions/action-helpers";
import { auth } from "@/lib/auth";
import { resolveCategoryDisplay } from "@/lib/category-display";
import { toIsoDate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

export default async function EditInstallmentPlanPage({
  params,
  searchParams,
}: PageProps<"/[locale]/transactions/installments/[id]/edit">) {
  const locale = await getLocale();
  // Authoritative check. This queries Postgres; src/proxy.ts does not.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return redirect({ href: "/login", locale });

  // `params` is a promise in this version of Next; it must be awaited.
  const { id } = await params;

  // Scoped to the session's userId, never to the id alone — someone else's
  // id finds nothing, which is indistinguishable from a nonexistent one.
  // `fixedOccurrencesCount: true` excludes an ongoing recurrence: that one
  // is edited through its own page, and its id 404s here rather than
  // opening the wrong editor — the mirror image of the guard
  // `recurring/[id]/edit/page.tsx` applies. `deactivatedAt: null` excludes a
  // soft-deleted plan for the same reason every other edit page excludes a
  // soft-deleted row.
  const plan = await prisma.recurringTransaction.findFirst({
    where: { id, userId: session.user.id, fixedOccurrencesCount: true, deactivatedAt: null },
    include: { category: true, card: true },
  });
  if (!plan) notFound();

  const [user, occurrences, t, tPresets] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: session.user.id },
      select: { dateFormat: true },
    }),
    // Only the plan's live rows — a soft-deleted occurrence stays gone.
    prisma.transaction.findMany({
      where: { recurringTransactionId: plan.id, deactivatedAt: null },
      orderBy: { date: "asc" },
    }),
    getTranslations("transactions"),
    getTranslations("categories.presets"),
  ]);

  const selectedCategory = {
    id: plan.category.id,
    name: resolveCategoryDisplay(plan.category, tPresets).name,
  };
  const selectedCard = plan.card ? { id: plan.card.id, name: plan.card.name } : null;

  // Validated the same way every other input is — bounded by
  // `TRANSACTION_ID_MAX_LENGTH` — and only passed through when it names a
  // live row of *this* plan. A malformed value, another plan's occurrence
  // id, or a soft-deleted one all fall back to "nothing to focus" rather
  // than 404ing: the page itself is still valid to show.
  const rawOccurrence = (await searchParams).occurrence;
  const occurrenceParam = Array.isArray(rawOccurrence) ? rawOccurrence[0] : rawOccurrence;
  const parsedOccurrence = transactionIdSchema.safeParse(occurrenceParam);
  const focusOccurrenceId =
    parsedOccurrence.success && occurrences.some((occurrence) => occurrence.id === parsedOccurrence.data)
      ? parsedOccurrence.data
      : null;

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/transactions"
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          {t("single.back")}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{t("installments.editTitle")}</h1>
      </div>

      <div className="w-full">
        <InstallmentSeriesForm
          planId={plan.id}
          defaultValues={{
            type: plan.type,
            categoryId: plan.categoryId,
            cardId: plan.cardId,
          }}
          selectedCategory={selectedCategory}
          selectedCard={selectedCard}
          occurrencesCount={plan.occurrencesCount}
          frequency={plan.frequency}
          startDate={toIsoDate(plan.startDate)}
          dateFormat={user.dateFormat}
        />
      </div>

      <div className="flex w-full flex-col gap-2">
        <h2 className="text-lg font-semibold tracking-tight">{t("installments.occurrencesTitle")}</h2>
        <InstallmentOccurrencesTable
          planId={plan.id}
          occurrences={occurrences.map((occurrence) => ({
            id: occurrence.id,
            date: toIsoDate(occurrence.date),
            // A `Decimal(12, 2)` column always round-trips to two places;
            // `toFixed(2)` is what keeps that guarantee on the way back out
            // of Prisma's `Decimal`, matching the schema's amount regex.
            amount: occurrence.amount.toFixed(2),
            description: occurrence.description,
            isPaid: occurrence.isPaid,
          }))}
          seriesValues={{
            type: plan.type,
            categoryId: plan.categoryId,
            cardId: plan.cardId,
          }}
          dateFormat={user.dateFormat}
          focusOccurrenceId={focusOccurrenceId}
        />
      </div>
    </main>
  );
}
