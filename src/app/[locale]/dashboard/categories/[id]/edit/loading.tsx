import { getTranslations } from "next-intl/server";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * In-shell loading state for the edit-category form.
 *
 * The same shape as `new/loading.tsx` — it is the same `CategoryForm` — under
 * a shorter heading ("Edit" rather than "New category"), which is the one
 * measurement that differs between the two pages. This segment needs its own
 * file regardless: `new/loading.tsx` does not cover `[id]/edit`.
 *
 * Per `.claude/rules/navigation-loading.md`, a skeleton that does not match
 * the real layout is worse than a spinner, so keep this in step with the form.
 */
export default async function EditCategoryLoading() {
  const t = await getTranslations("common");

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-8 w-24" />
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 flex flex-col gap-2 lg:col-span-5">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-9 w-full lg:h-11" />
        </div>

        <div className="col-span-12 flex flex-col gap-2 lg:col-span-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-full lg:h-11" />
        </div>

        <div className="col-span-12 flex flex-col gap-2 lg:col-span-2">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="size-16 rounded-full" />
        </div>

        <div className="col-span-12 lg:justify-self-end">
          <Skeleton className="h-10 w-full lg:w-32" />
        </div>
      </div>

      <span className="sr-only">{t("loading")}</span>
    </main>
  );
}
