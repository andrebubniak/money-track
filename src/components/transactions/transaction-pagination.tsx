import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

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
 * Which numbered links to render, collapsing every run of one or more
 * skipped pages into a single ellipsis. Page 1 and the last page always
 * show; up to two pages on either side of the current one fill the middle
 * (at most 5 numbers), so the numbered-link count is `withEnds.length`,
 * which is never more than 1 + 5 + 1 = 7 — the widest case is the current
 * page deep in a long list: `1, …, current-2 … current+2, …, last`.
 *
 * A gap of exactly one skipped page is *also* rendered as an ellipsis here,
 * rather than filled in with that page's own number. An earlier version
 * filled single-page gaps, but that fill re-added a page the clipping above
 * had just trimmed *in addition to* the full window rather than instead of
 * it, which broke the seven-link cap (e.g. `totalPages=9, page=5` rendered
 * nine numbers, no ellipsis at all). Any gap ≥ 2, filled or not, is capped
 * by construction because it never grows `withEnds` — only collapsing to a
 * single ellipsis touches count, so always collapsing is what keeps the cap
 * correct in every case, not just the ones exercised by hand.
 */
function pageWindow(page: number, totalPages: number): (number | "ellipsis")[] {
  const delta = 2;
  const middle: number[] = [];
  for (let i = Math.max(2, page - delta); i <= Math.min(totalPages - 1, page + delta); i++) {
    middle.push(i);
  }

  // `Set` also protects the degenerate `totalPages <= 1` case, where `1` and
  // `totalPages` would otherwise be the same value twice — unreachable
  // through the component today (it returns null before `totalPages` is
  // even computed when there's only one page), but `pageWindow` shouldn't
  // rely on that guarantee to produce a sane, duplicate-free result.
  const withEnds = [...new Set([1, ...middle, totalPages])];
  const result: (number | "ellipsis")[] = [];
  let previous = 0;
  for (const value of withEnds) {
    if (previous && value - previous >= 2) result.push("ellipsis");
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
 *
 * Not async: `useTranslations` (unlike `getTranslations`) works in a
 * synchronous Server Component just as well as in a Client one — see
 * `.claude/rules/i18n.md` — and staying synchronous lets this render like
 * any other component in `transaction-pagination.spec.tsx`, the same way
 * `TransactionTable` already does, instead of needing the caller to somehow
 * await a component function by hand.
 */
export function TransactionPagination({ page, total, hrefForPage }: TransactionPaginationProps) {
  // Called unconditionally, before the early return below — React requires
  // every hook to run in the same order on every render.
  const t = useTranslations("ui.pagination");

  if (total <= PAGE_SIZE) return null;

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
