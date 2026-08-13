import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";

import { DeleteCategoryButton } from "@/components/categories/delete-category-button";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link, redirect } from "@/i18n/navigation";
import { auth } from "@/lib/auth";
import { resolveCategoryDisplay } from "@/lib/category-display";
import { CATEGORY_ICONS, DEFAULT_CATEGORY_ICON, isCategoryIcon } from "@/lib/category-icons";
import { prisma } from "@/lib/prisma";
import { MAX_ACTIVE_CATEGORIES } from "@/lib/validations/category";

export default async function CategoriesPage() {
  const locale = await getLocale();
  // Authoritative check. This queries Postgres; src/proxy.ts does not.
  const session = await auth.api.getSession({ headers: await headers() });
  // `return`, not a bare statement — see the same call in `dashboard/page.tsx`
  // for why the narrowing depends on it.
  if (!session) return redirect({ href: "/login", locale });

  const categories = await prisma.category.findMany({
    where: { userId: session.user.id, deactivatedAt: null },
  });

  const t = await getTranslations("categories");
  const tPresets = await getTranslations("categories.presets");

  // Deliberately not `orderBy: { name: "asc" }` in the query above: a preset
  // row's `name` column holds English fallback text, so the database would
  // order pt-BR and de-DE tables by words the user never sees. Resolve the
  // display text first, then collate it. The 50-row cap is what makes sorting
  // in application code affordable.
  const collator = new Intl.Collator(locale);
  const rows = categories
    .map((category) => ({
      id: category.id,
      icon: category.icon,
      display: resolveCategoryDisplay(category, tPresets),
    }))
    .sort((a, b) => collator.compare(a.display.name, b.display.name));

  // Read off the rows already fetched rather than issuing a second `count()`.
  // Purely a convenience for the UI — `createCategory` re-checks the cap
  // server-side on every call regardless of what this renders.
  const atLimit = categories.length >= MAX_ACTIVE_CATEGORIES;

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>

        {atLimit ? (
          // Disabled rather than hidden: an action that vanishes without
          // explanation reads as a bug, and `limitReached` says why.
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <Button disabled>
              <Plus data-icon="inline-start" aria-hidden="true" />
              {t("actions.new")}
            </Button>
            <p className="text-sm text-muted-foreground">
              {t("limitReached", { max: MAX_ACTIVE_CATEGORIES })}
            </p>
          </div>
        ) : (
          // A plain `Link`, not `AppLink`: this segment's own `loading.tsx`
          // covers the transition. `AppLink`'s overlay is for entering the
          // shell, not for moving around inside it — see
          // `.claude/rules/navigation-loading.md`.
          //
          // `buttonVariants()` on the anchor rather than `<Button render={…}>`:
          // base-ui's Button assumes a native `<button>` and warns that
          // rendering an `<a>` instead strips button semantics. This is a
          // navigation, so `<a>` is the semantics we actually want.
          <Link href="/dashboard/categories/new" className={buttonVariants()}>
            <Plus data-icon="inline-start" aria-hidden="true" />
            {t("actions.new")}
          </Link>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">{t("table.icon")}</TableHead>
              <TableHead>{t("table.name")}</TableHead>
              <TableHead>{t("table.description")}</TableHead>
              <TableHead className="text-right">{t("table.actions")}</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {rows.length === 0 ? (
              // Reachable only if a user deletes all 11 seeded presets, but
              // an empty table with no explanation is worse than the check.
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center whitespace-normal">
                  <span className="flex flex-col items-center gap-2">
                    <span className="text-sm text-muted-foreground">{t("table.empty")}</span>
                    <Link
                      href="/dashboard/categories/new"
                      className="text-sm font-medium underline underline-offset-4"
                    >
                      {t("table.emptyCta")}
                    </Link>
                  </span>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                // `icon` is a plain `String` column; the schema only bounds what
                // the app writes, so fall back rather than index with `undefined`.
                const Icon = CATEGORY_ICONS[isCategoryIcon(row.icon) ? row.icon : DEFAULT_CATEGORY_ICON];

                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Icon aria-hidden="true" className="size-5 text-muted-foreground" />
                    </TableCell>
                    <TableCell className="font-medium">{row.display.name}</TableCell>
                    <TableCell className="max-w-[40ch] truncate text-muted-foreground">
                      {row.display.description}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="flex items-center justify-end gap-1">
                        <Link
                          href={`/dashboard/categories/${row.id}/edit`}
                          className={buttonVariants({ variant: "ghost", size: "sm" })}
                        >
                          {t("actions.edit")}
                        </Link>
                        <DeleteCategoryButton categoryId={row.id} />
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </main>
  );
}
