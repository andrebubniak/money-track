import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { toUtcMidnight } from "@/lib/dates";
import { formatDate, formatMoney, type UserFormatPreferences } from "@/lib/format";
import type { TransactionListRow } from "@/lib/transactions/list-query";
import type { TransactionFilters, TransactionSort } from "@/lib/validations/transaction-filters";
import { NewTransactionMenu } from "@/components/transactions/new-transaction-menu";
import { TransactionRowActions } from "@/components/transactions/transaction-row-actions";
import { cn } from "@/lib/utils";

export type TransactionTableProps = {
  rows: TransactionListRow[];
  categoryNames: Record<string, string>;
  cardNames: Record<string, string>;
  preferences: UserFormatPreferences;
  filters: TransactionFilters;
  sortHrefs: Record<TransactionSort, string>;
  /** Distinguishes "no transactions yet" from "none match these filters". */
  hasAnyTransactions: boolean;
  clearHref: string;
};

/**
 * The rendered column order, and which of them sort. `sort=amount` stays
 * the URL value even though the column now reads "Value", so links already
 * in the wild keep working.
 */
const COLUMNS = [
  { key: "description", sortable: true },
  { key: "amount", sortable: true, align: "right" },
  { key: "category", sortable: true },
  { key: "card", sortable: false },
  { key: "type", sortable: false },
  { key: "date", sortable: true },
  { key: "paymentDate", sortable: false },
  { key: "actions", sortable: false, align: "right" },
] as const;

export function TransactionTable({
  rows,
  categoryNames,
  cardNames,
  preferences,
  filters,
  sortHrefs,
  hasAnyTransactions,
  clearHref,
}: TransactionTableProps) {
  const t = useTranslations("transactions");

  function sortIcon(column: TransactionSort) {
    if (filters.sort !== column) return <ArrowUpDown aria-hidden="true" className="size-4" />;
    return filters.dir === "asc" ? (
      <ArrowUp aria-hidden="true" className="size-4" />
    ) : (
      <ArrowDown aria-hidden="true" className="size-4" />
    );
  }

  function ariaSort(column: TransactionSort) {
    if (filters.sort !== column) return "none" as const;
    return filters.dir === "asc" ? ("ascending" as const) : ("descending" as const);
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((column) => (
              <TableHead
                key={column.key}
                aria-sort={column.sortable ? ariaSort(column.key as TransactionSort) : undefined}
                className={"align" in column ? "text-right" : undefined}
              >
                {column.sortable ? (
                  <Link
                    href={sortHrefs[column.key as TransactionSort]}
                    className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
                    aria-label={t("table.sortBy", { column: t(`table.${column.key}`) })}
                  >
                    {t(`table.${column.key}`)}
                    {sortIcon(column.key as TransactionSort)}
                  </Link>
                ) : (
                  t(`table.${column.key}`)
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>

        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="h-24 text-center whitespace-normal">
                <span className="flex flex-col items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {hasAnyTransactions ? t("table.emptyFiltered") : t("table.empty")}
                  </span>
                  {hasAnyTransactions ? (
                    <Link
                      href={clearHref}
                      className="text-sm font-medium underline underline-offset-4"
                    >
                      {t("table.emptyFilteredCta")}
                    </Link>
                  ) : (
                    // The same three choices the page header offers — this is a
                    // creation entry point, and a bare link to /transactions/new
                    // would hide two of them. "Clear filters" above is not, so
                    // it stays a plain link.
                    <NewTransactionMenu variant="link" label={t("table.emptyCta")} />
                  )}
                </span>
              </TableCell>
            </TableRow>
          ) : (
            rows.map((entry) => (
              <TableRow key={`${entry.kind}-${entry.id}`}>
                <TableCell className="font-medium">
                  <span className="flex flex-wrap items-center gap-2">
                    {entry.description ?? t("table.none")}
                    {entry.kind === "recurring" && entry.frequency && (
                      <Badge variant="secondary">{t(`frequency.${entry.frequency}`)}</Badge>
                    )}
                    {entry.kind === "installment" && entry.seriesIndex && entry.seriesTotal && (
                      <Badge variant="secondary">
                        {t("table.series", { index: entry.seriesIndex, total: entry.seriesTotal })}
                      </Badge>
                    )}
                  </span>
                </TableCell>

                <TableCell
                  className={cn(
                    "text-right font-medium tabular-nums",
                    entry.type === "INCOME" && "text-success",
                  )}
                >
                  {entry.type === "INCOME" ? "+" : "−"}
                  {formatMoney(entry.amount, preferences)}
                </TableCell>

                <TableCell className="text-muted-foreground">
                  {categoryNames[entry.categoryId] ?? t("table.none")}
                </TableCell>

                <TableCell className="text-muted-foreground">
                  {entry.cardId ? (cardNames[entry.cardId] ?? t("table.none")) : t("table.none")}
                </TableCell>

                <TableCell className="text-muted-foreground">
                  {entry.type === "INCOME" ? t("table.typeIncome") : t("table.typeExpense")}
                </TableCell>

                <TableCell>
                  <span className="flex flex-col">
                    <span>{formatDate(toUtcMidnight(entry.effectiveDate), preferences.dateFormat)}</span>
                    {entry.kind === "recurring" && entry.startDate && (
                      <span className="text-xs text-muted-foreground">
                        {t("table.started", {
                          date: formatDate(toUtcMidnight(entry.startDate), preferences.dateFormat),
                        })}
                      </span>
                    )}
                  </span>
                </TableCell>

                <TableCell className="text-muted-foreground">
                  {entry.kind === "recurring" ? (
                    // A recurrence is a definition, not a payment.
                    t("table.none")
                  ) : entry.paymentDate ? (
                    formatDate(toUtcMidnight(entry.paymentDate), preferences.dateFormat)
                  ) : (
                    // Secondary, not destructive: an unpaid expense is a state, not an
                    // error, and a table of red badges reads as a page full of problems.
                    <Badge variant="secondary">{t("table.notPaid")}</Badge>
                  )}
                </TableCell>

                <TableCell className="text-right">
                  <TransactionRowActions row={entry} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
