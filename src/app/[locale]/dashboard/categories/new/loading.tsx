import { getTranslations } from "next-intl/server";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * In-shell loading state for the create-category form.
 *
 * Mirrors `new/page.tsx`: back link, heading, then `CategoryForm`'s three
 * fields (name, description, icon) and its full-width submit button. Sized to
 * that page's own heading — see the sibling `[id]/edit/loading.tsx`, which is
 * the same form under a shorter title. Per
 * `.claude/rules/navigation-loading.md`, a skeleton that does not match the
 * real layout is worse than a spinner, so keep this in step with the form.
 */
export default async function NewCategoryLoading() {
  const t = await getTranslations("common");

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-8 w-48" />
      </div>

      <div className="flex w-full max-w-xl flex-col gap-4 lg:max-w-3xl">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-9 w-full lg:h-11" />
        </div>

        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-full lg:h-11" />
        </div>

        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="size-16 rounded-full" />
        </div>

        <Skeleton className="h-10 w-full lg:ml-auto lg:w-32" />
      </div>

      <span className="sr-only">{t("loading")}</span>
    </main>
  );
}
