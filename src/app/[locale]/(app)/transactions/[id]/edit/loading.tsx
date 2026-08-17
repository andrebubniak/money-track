import { getTranslations } from "next-intl/server";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * In-shell loading state for the edit-transaction form — the same shape as
 * `new/loading.tsx` under a shorter heading, per
 * `.claude/rules/navigation-loading.md`.
 */
export default async function EditTransactionLoading() {
  const t = await getTranslations("common");

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-8 w-40" />
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 flex flex-col gap-2 lg:col-span-4">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-9 w-full lg:h-11" />
        </div>
        <div className="col-span-12 flex flex-col gap-2 lg:col-span-4">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-9 w-full lg:h-11" />
        </div>
        <div className="col-span-12 flex flex-col gap-2 lg:col-span-4">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-9 w-full lg:h-11" />
        </div>

        <div className="col-span-12 flex flex-col gap-2 lg:col-span-6">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-9 w-full lg:h-11" />
        </div>
        <div className="col-span-12 flex flex-col gap-2 lg:col-span-6">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-9 w-full lg:h-11" />
        </div>

        <div className="col-span-12 flex flex-col gap-2 lg:col-span-9">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-full lg:h-11" />
        </div>
        <div className="col-span-12 flex flex-col justify-center gap-2 lg:col-span-3">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-6 w-6" />
        </div>

        <div className="col-span-12 lg:justify-self-end">
          <Skeleton className="h-10 w-full lg:w-32" />
        </div>
      </div>

      <span className="sr-only">{t("loading")}</span>
    </main>
  );
}
