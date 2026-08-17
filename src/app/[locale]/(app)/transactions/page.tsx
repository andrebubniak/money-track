import { Suspense } from "react";
import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";

import { NewTransactionMenu } from "@/components/transactions/new-transaction-menu";
import { TransactionResults } from "@/components/transactions/transaction-results";
import { TransactionTableSkeleton } from "@/components/transactions/transaction-table-skeleton";
import { redirect } from "@/i18n/navigation";
import { auth } from "@/lib/auth";
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
  // `buildTransactionSearchParams` (in `TransactionResults`) cannot disagree
  // about what the default period is.
  const today = new Date();
  const params = await searchParams;
  const filters = parseTransactionFilters(params, today);

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>

        <NewTransactionMenu />
      </div>

      {/* Keyed on the params, so every filter, sort, or page change
          re-suspends and shows the skeleton instead of freezing the
          previous page's rows underneath the new URL. */}
      <Suspense key={JSON.stringify(params)} fallback={<TransactionTableSkeleton />}>
        <TransactionResults userId={session.user.id} filters={filters} today={today} />
      </Suspense>
    </main>
  );
}
