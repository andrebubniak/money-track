import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";

import { CategoryForm } from "@/components/categories/category-form";
import { Link, redirect } from "@/i18n/navigation";
import { auth } from "@/lib/auth";
import { DEFAULT_CATEGORY_ICON } from "@/lib/category-icons";

export default async function NewCategoryPage() {
  const locale = await getLocale();
  // Authoritative check. This queries Postgres; src/proxy.ts does not.
  const session = await auth.api.getSession({ headers: await headers() });
  // `return`, not a bare statement — see the same call in `dashboard/page.tsx`
  // for why the narrowing depends on it.
  if (!session) return redirect({ href: "/login", locale });

  const t = await getTranslations("categories");

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-2">
        {/* Plain `Link`, not `AppLink`: the list segment's own `loading.tsx`
            covers this transition — see `.claude/rules/navigation-loading.md`. */}
        <Link
          href="/dashboard/categories"
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          {t("title")}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{t("actions.new")}</h1>
      </div>

      {/* No max-width: CategoryForm's own grid decides how much of the row
          each field takes at each breakpoint — see `.claude/rules/ui.md`. */}
      <div className="w-full">
        <CategoryForm
          mode="create"
          defaultValues={{ name: "", description: "", icon: DEFAULT_CATEGORY_ICON }}
        />
      </div>
    </main>
  );
}
