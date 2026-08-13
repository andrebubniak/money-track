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

      <div className="flex w-full max-w-xl flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-9 w-full" />
        </div>

        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>

        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-12" />
          <div className="flex items-center gap-3">
            <Skeleton className="size-8" />
            <div className="flex flex-col gap-1">
              <Skeleton className="h-9 w-9" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        </div>

        <Skeleton className="h-10 w-full" />
      </div>

      <span className="sr-only">{t("loading")}</span>
    </main>
  );
}
