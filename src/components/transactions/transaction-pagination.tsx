import { ChevronLeft, ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { buttonVariants } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@/components/ui/pagination";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { PAGE_SIZE } from "@/lib/validations/transaction-filters";

export type TransactionPaginationProps = {
  page: number;
  total: number;
  hrefForPage: (page: number) => string;
};

/**
 * Which numbered links to render, collapsing any run of more than one
 * skipped page into a single ellipsis. Page 1 and the last page always show;
 * up to two pages on either side of the current one fill the middle, so the
 * widest case — the current page deep in a long list — shows at most seven
 * numbered links: 1, …, current-2 … current+2, …, last.
 */
function pageWindow(page: number, totalPages: number): (number | "ellipsis")[] {
  const delta = 2;
  const middle: number[] = [];
  for (let i = Math.max(2, page - delta); i <= Math.min(totalPages - 1, page + delta); i++) {
    middle.push(i);
  }

  const withEnds = [1, ...middle, totalPages];
  const result: (number | "ellipsis")[] = [];
  let previous = 0;
  for (const value of withEnds) {
    if (previous) {
      if (value - previous === 2) result.push(previous + 1);
      else if (value - previous > 2) result.push("ellipsis");
    }
    result.push(value);
    previous = value;
  }
  return result;
}

function PrevNext({
  direction,
  href,
  label,
}: {
  direction: "previous" | "next";
  href: string | null;
  label: string;
}) {
  const Icon = direction === "previous" ? ChevronLeft : ChevronRight;
  const className = cn(
    buttonVariants({ variant: "ghost", size: "default" }),
    direction === "previous" ? "pl-2!" : "pr-2!",
    href === null && "pointer-events-none opacity-50",
  );
  const content = (
    <>
      {direction === "previous" && <Icon aria-hidden="true" className="size-4" />}
      <span className="hidden sm:block">{label}</span>
      {direction === "next" && <Icon aria-hidden="true" className="size-4" />}
    </>
  );

  if (href === null) {
    return (
      <span aria-disabled="true" aria-label={label} className={className}>
        {content}
      </span>
    );
  }

  return (
    <Link href={href} aria-label={label} className={className}>
      {content}
    </Link>
  );
}

/**
 * Server-rendered pagination: every href is a real `Link`, built from the
 * caller's `hrefForPage` so this component never assembles a query string of
 * its own — see `TransactionResults`. Renders nothing once everything fits
 * on a single page.
 */
export async function TransactionPagination({ page, total, hrefForPage }: TransactionPaginationProps) {
  if (total <= PAGE_SIZE) return null;

  const t = await getTranslations("ui.pagination");
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const pages = pageWindow(page, totalPages);

  return (
    <Pagination aria-label={t("label")}>
      <PaginationContent>
        <PaginationItem>
          <PrevNext
            direction="previous"
            href={page > 1 ? hrefForPage(page - 1) : null}
            label={t("previous")}
          />
        </PaginationItem>

        {pages.map((entry, index) =>
          entry === "ellipsis" ? (
            <PaginationItem key={`ellipsis-${index}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={entry}>
              <Link
                href={hrefForPage(entry)}
                aria-label={t("page", { page: entry })}
                aria-current={entry === page ? "page" : undefined}
                className={cn(
                  buttonVariants({ variant: entry === page ? "outline" : "ghost", size: "icon" }),
                )}
              >
                {entry}
              </Link>
            </PaginationItem>
          ),
        )}

        <PaginationItem>
          <PrevNext
            direction="next"
            href={page < totalPages ? hrefForPage(page + 1) : null}
            label={t("next")}
          />
        </PaginationItem>
      </PaginationContent>

      <span className="sr-only" aria-live="polite">
        {t("status", { page, total: totalPages })}
      </span>
    </Pagination>
  );
}
