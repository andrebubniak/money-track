import { getTranslations } from "next-intl/server";

import { Skeleton } from "@/components/ui/skeleton";
import { TransactionTableSkeleton } from "@/components/transactions/transaction-table-skeleton";

/**
 * In-shell loading state for the transaction list. Mirrors `page.tsx`'s real
 * layout (header + create menu), plus a filter bar and eight table rows for
 * the list a later task adds — see `.claude/rules/navigation-loading.md`.
 */
export default async function TransactionsLoading() {
  const t = await getTranslations("common");

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-40" />
      </div>

      <Skeleton className="h-11 w-full" />

      <TransactionTableSkeleton />

      <span className="sr-only">{t("loading")}</span>
    </main>
  );
}
