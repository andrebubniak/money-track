import { getTranslations } from "next-intl/server";

import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PLACEHOLDER_ROWS = [0, 1, 2, 3, 4];

/**
 * In-shell loading state for the category list.
 *
 * Renders inside `SidebarInset`, so only the content area swaps and the
 * sidebar stays put — the skeleton pattern in
 * `.claude/rules/navigation-loading.md`. It mirrors `page.tsx`'s real layout
 * (header + action button, then a four-column table) so nothing jumps when the
 * rows arrive. Keep the two in step.
 */
export default async function CategoriesLoading() {
  const t = await getTranslations("common");

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-36" />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">
                <Skeleton className="h-4 w-8" />
              </TableHead>
              <TableHead>
                <Skeleton className="h-4 w-16" />
              </TableHead>
              <TableHead>
                <Skeleton className="h-4 w-24" />
              </TableHead>
              <TableHead className="text-right">
                <Skeleton className="ml-auto h-4 w-16" />
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {PLACEHOLDER_ROWS.map((row) => (
              <TableRow key={row}>
                <TableCell>
                  <Skeleton className="size-6 rounded-full" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-32" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-64" />
                </TableCell>
                <TableCell>
                  <span className="flex items-center justify-end">
                    <Skeleton className="size-9" />
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <span className="sr-only">{t("loading")}</span>
    </main>
  );
}
