import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";

import { CategoryForm } from "@/components/categories/category-form";
import { Link, redirect } from "@/i18n/navigation";
import { auth } from "@/lib/auth";
import { resolveCategoryDisplay } from "@/lib/category-display";
import { DEFAULT_CATEGORY_ICON, isCategoryIcon } from "@/lib/category-icons";
import { prisma } from "@/lib/prisma";

export default async function EditCategoryPage({
  params,
}: PageProps<"/[locale]/categories/[id]/edit">) {
  const locale = await getLocale();
  // Authoritative check. This queries Postgres; src/proxy.ts does not.
  const session = await auth.api.getSession({ headers: await headers() });
  // `return`, not a bare statement — see the same call in `dashboard/page.tsx`
  // for why the narrowing depends on it.
  if (!session) return redirect({ href: "/login", locale });

  // `params` is a promise in this version of Next; it must be awaited.
  const { id } = await params;

  // Scoped to the session's userId, never to the id alone — the same rule
  // `updateCategory`/`deleteCategory` follow. Someone else's id finds nothing,
  // which is indistinguishable from a nonexistent one.
  const category = await prisma.category.findFirst({
    where: { id, userId: session.user.id, deactivatedAt: null },
  });
  if (!category) notFound();

  const t = await getTranslations("categories");
  const tPresets = await getTranslations("categories.presets");

  // A still-linked preset prefills with its *translated* text, which is what
  // the user is looking at in the table. Submitting the form then stores that
  // text literally and clears `systemLocaleKey` — see the design spec.
  const display = resolveCategoryDisplay(category, tPresets);

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-2">
        {/* Plain `Link`, not `AppLink`: the list segment's own `loading.tsx`
            covers this transition — see `.claude/rules/navigation-loading.md`. */}
        <Link
          href="/categories"
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          {t("title")}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{t("actions.edit")}</h1>
      </div>

      {/* No max-width: CategoryForm's own grid decides how much of the row
          each field takes at each breakpoint — see `.claude/rules/ui.md`. */}
      <div className="w-full">
        <CategoryForm
          mode="edit"
          categoryId={category.id}
          defaultValues={{
            name: display.name,
            // The form's `description` field is a text input; `null` would make
            // it uncontrolled and warn.
            description: display.description ?? "",
            // `icon` is a plain `String` column, so narrow it rather than
            // asserting — a value written before the allow-list existed, or by
            // anything but this app, still has to render.
            icon: isCategoryIcon(category.icon) ? category.icon : DEFAULT_CATEGORY_ICON,
          }}
        />
      </div>
    </main>
  );
}
