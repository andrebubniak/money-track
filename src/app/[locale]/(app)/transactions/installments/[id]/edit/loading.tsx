import { getTranslations } from "next-intl/server";

import { Skeleton } from "@/components/ui/skeleton";

const PLACEHOLDER_ROWS = [0, 1, 2, 3, 4];

/**
 * In-shell loading state for the installment plan edit page — the series
 * form's grid (type/category/card, then the frozen frequency/start
 * date/count row, then its submit button and its own "Delete plan" button),
 * followed by the occurrences table's own shape, per
 * `.claude/rules/navigation-loading.md`.
 */
export default async function EditInstallmentPlanLoading() {
  const t = await getTranslations("common");

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-8 w-56" />
      </div>

      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-12 gap-4">
          <Skeleton className="col-span-12 h-4 w-full max-w-md" />

          <div className="col-span-12 flex flex-col gap-2 lg:col-span-4">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-9 w-full lg:h-11" />
          </div>
          <div className="col-span-12 flex flex-col gap-2 lg:col-span-4">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-9 w-full lg:h-11" />
          </div>
          <div className="col-span-12 flex flex-col gap-2 lg:col-span-4">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-9 w-full lg:h-11" />
          </div>

          <Skeleton className="col-span-12 h-4 w-full max-w-lg" />

          <div className="col-span-12 flex flex-col gap-2 lg:col-span-4">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-5 w-24" />
          </div>
          <div className="col-span-12 flex flex-col gap-2 lg:col-span-4">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-5 w-24" />
          </div>
          <div className="col-span-12 flex flex-col gap-2 lg:col-span-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-5 w-10" />
          </div>

          <div className="col-span-12 lg:justify-self-end">
            <Skeleton className="h-10 w-full lg:w-32" />
          </div>
        </div>

        <Skeleton className="h-10 w-full max-w-40" />
      </div>

      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-32" />
        <div className="rounded-md border">
          <Skeleton className="h-10 w-full rounded-b-none" />
          {PLACEHOLDER_ROWS.map((row) => (
            <Skeleton key={row} className="h-12 w-full rounded-none border-t" />
          ))}
        </div>
      </div>

      <span className="sr-only">{t("loading")}</span>
    </main>
  );
}
