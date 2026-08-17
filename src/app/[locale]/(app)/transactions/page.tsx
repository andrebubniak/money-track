import { Suspense } from "react";
import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";

import { NewTransactionMenu } from "@/components/transactions/new-transaction-menu";
import { TransactionFiltersPanel } from "@/components/transactions/transaction-filters";
import { TransactionResults } from "@/components/transactions/transaction-results";
import { TransactionTableSkeleton } from "@/components/transactions/transaction-table-skeleton";
import { redirect } from "@/i18n/navigation";
import { auth } from "@/lib/auth";
import { resolveCategoryDisplay } from "@/lib/category-display";
import { toIsoDate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { parseTransactionFilters } from "@/lib/validations/transaction-filters";

export default async function TransactionsPage({
  searchParams,
}: PageProps<"/[locale]/transactions">) {
  const locale = await getLocale();
  // Authoritative check. This queries Postgres; src/proxy.ts does not.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return redirect({ href: "/login", locale });

  const t = await getTranslations("transactions");

  // One `today` for the whole request, so `parseTransactionFilters` and
  // `buildTransactionSearchParams` (in `TransactionResults` and the filter
  // panel) cannot disagree about what the default period is.
  const today = new Date();
  const params = await searchParams;
  const filters = parseTransactionFilters(params, today);

  // Looked up here, above the `Suspense` boundary, so the filter panel's
  // comboboxes show the active category/card's name on first paint instead
  // of blank while the endpoint they'd otherwise hit resolves.
  const [user, selectedCategory, selectedCard] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: session.user.id },
      select: { dateFormat: true },
    }),
    filters.categoryId
      ? prisma.category.findUnique({
          where: { id: filters.categoryId, userId: session.user.id },
          select: { id: true, name: true, description: true, systemLocaleKey: true },
        })
      : null,
    filters.cardId
      ? prisma.card.findUnique({
          where: { id: filters.cardId, userId: session.user.id },
          select: { id: true, name: true },
        })
      : null,
  ]);

  const tPresets = await getTranslations("categories.presets");

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>

        <NewTransactionMenu />
      </div>

      <TransactionFiltersPanel
        filters={filters}
        today={toIsoDate(today)}
        dateFormat={user.dateFormat}
        selectedCategory={
          selectedCategory
            ? { id: selectedCategory.id, name: resolveCategoryDisplay(selectedCategory, tPresets).name }
            : null
        }
        selectedCard={selectedCard}
      />

      {/* Keyed on the params, so every filter, sort, or page change
          re-suspends and shows the skeleton instead of freezing the
          previous page's rows underneath the new URL. */}
      <Suspense key={JSON.stringify(params)} fallback={<TransactionTableSkeleton />}>
        <TransactionResults userId={session.user.id} filters={filters} today={today} />
      </Suspense>
    </main>
  );
}
