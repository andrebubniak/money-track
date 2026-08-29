import { getTranslations } from "next-intl/server";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * In-shell loading state for the create-card form. Mirrors `new/page.tsx`:
 * back link, heading, then `CardForm`'s two fields (name, type) and its
 * full-width submit button — see `.claude/rules/navigation-loading.md`.
 */
export default async function NewCardLoading() {
  const t = await getTranslations("common");

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-8 w-48" />
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 flex flex-col gap-2 lg:col-span-8">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-9 w-full lg:h-11" />
        </div>

        <div className="col-span-12 flex flex-col gap-2 lg:col-span-4">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-9 w-full lg:h-11" />
        </div>

        <div className="col-span-12 lg:justify-self-end">
          <Skeleton className="h-10 w-full lg:w-32" />
        </div>
      </div>

      <span className="sr-only">{t("loading")}</span>
    </main>
  );
}
