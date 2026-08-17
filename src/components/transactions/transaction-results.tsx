import { getTranslations } from "next-intl/server";

import { TransactionPagination } from "@/components/transactions/transaction-pagination";
import { TransactionTable } from "@/components/transactions/transaction-table";
import { resolveCategoryDisplay } from "@/lib/category-display";
import { prisma } from "@/lib/prisma";
import { fetchTransactionList } from "@/lib/transactions/list-query";
import {
  buildTransactionSearchParams,
  clampPage,
  type TransactionFilters,
  type TransactionSort,
} from "@/lib/validations/transaction-filters";

export type TransactionResultsProps = {
  userId: string;
  filters: TransactionFilters;
  today: Date;
};

const SORT_COLUMNS = ["date", "amount", "category", "description"] as const;

/**
 * Fetches and assembles the transaction list. An async Server Component, so
 * `page.tsx` can wrap it in `Suspense` and show a skeleton while it runs.
 */
export async function TransactionResults({ userId, filters, today }: TransactionResultsProps) {
  const [user, categories, cards] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { currency: true, numberFormat: true, dateFormat: true },
    }),
    prisma.category.findMany({
      where: { userId, deactivatedAt: null },
      select: { id: true, name: true, description: true, systemLocaleKey: true },
    }),
    prisma.card.findMany({
      where: { userId, deactivatedAt: null },
      select: { id: true, name: true },
    }),
  ]);

  const tPresets = await getTranslations("categories.presets");

  // Resolved once and used twice: to render the category column, and — for
  // `sort=category` — as the join that lets Postgres order on the text the
  // user actually reads instead of a preset's English `name` column.
  const categoryNames = Object.fromEntries(
    categories.map((category) => [category.id, resolveCategoryDisplay(category, tPresets).name]),
  );

  const first = await fetchTransactionList({
    userId,
    filters,
    categorySortNames: new Map(Object.entries(categoryNames)),
  });

  // A `?page=` past the end is clamped rather than shown as an empty table.
  // The second fetch only happens on that out-of-range case.
  const page = clampPage(filters.page, first.total);
  const { rows, total } =
    page === filters.page
      ? first
      : await fetchTransactionList({
          userId,
          filters: { ...filters, page },
          categorySortNames: new Map(Object.entries(categoryNames)),
        });

  const hasAnyTransactions =
    total > 0 ||
    (await prisma.transaction.count({ where: { userId, deactivatedAt: null } })) > 0 ||
    (await prisma.recurringTransaction.count({ where: { userId, deactivatedAt: null } })) > 0;

  const hrefFor = (next: Partial<TransactionFilters>) => {
    const params = buildTransactionSearchParams({ ...filters, page, ...next }, today);
    const query = params.toString();
    return query ? `/transactions?${query}` : "/transactions";
  };

  const sortHrefs = Object.fromEntries(
    SORT_COLUMNS.map((column) => [
      column,
      // Clicking the active column flips direction; a new column starts
      // descending, and either way pagination restarts at page 1.
      hrefFor({
        sort: column,
        dir: filters.sort === column && filters.dir === "desc" ? "asc" : "desc",
        page: 1,
      }),
    ]),
  ) as Record<TransactionSort, string>;

  return (
    <div className="flex flex-col gap-4">
      <TransactionTable
        rows={rows}
        categoryNames={categoryNames}
        cardNames={Object.fromEntries(cards.map((card) => [card.id, card.name]))}
        preferences={user}
        filters={{ ...filters, page }}
        sortHrefs={sortHrefs}
        hasAnyTransactions={hasAnyTransactions}
        clearHref="/transactions"
      />

      <TransactionPagination page={page} total={total} hrefForPage={(next) => hrefFor({ page: next })} />
    </div>
  );
}
