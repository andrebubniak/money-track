import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const PLACEHOLDER_ROWS = [0, 1, 2, 3, 4, 5, 6, 7];

/**
 * Mirrors `COLUMNS` in `transaction-table.tsx`: Description, Value, Category,
 * Card, Type, Date, Payment date, Actions — same order, same alignment, so
 * the loading shape doesn't jump once the real columns arrive.
 */
const COLUMNS = [
  { key: "description", align: "left" },
  { key: "amount", align: "right" },
  { key: "category", align: "left" },
  { key: "card", align: "left" },
  { key: "type", align: "left" },
  { key: "date", align: "left" },
  { key: "paymentDate", align: "left" },
  { key: "actions", align: "right" },
] as const;

/**
 * The table's own loading shape: a header row plus eight placeholder rows,
 * both built from the real table's column list. Shared by `loading.tsx` (the
 * in-shell navigation fallback for the whole route) and the page's own
 * `Suspense` boundary around `TransactionResults` (the fallback while
 * filters/sort/page changes re-fetch), so both render the exact same shape
 * instead of two hand-maintained copies drifting apart.
 */
export function TransactionTableSkeleton() {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((column) => (
              <TableHead
                key={column.key}
                className={column.align === "right" ? "text-right" : undefined}
              >
                <Skeleton className={cn("h-4 w-16", column.align === "right" && "ml-auto")} />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {PLACEHOLDER_ROWS.map((row) => (
            <TableRow key={row}>
              {COLUMNS.map((column) => (
                <TableCell
                  key={column.key}
                  className={column.align === "right" ? "text-right" : undefined}
                >
                  <Skeleton className={cn("h-4 w-20", column.align === "right" && "ml-auto")} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
