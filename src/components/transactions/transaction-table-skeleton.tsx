import { Skeleton } from "@/components/ui/skeleton";

const PLACEHOLDER_ROWS = [0, 1, 2, 3, 4, 5, 6, 7];

/**
 * The table's own loading shape: a header bar plus eight placeholder rows.
 * Shared by `loading.tsx` (the in-shell navigation fallback for the whole
 * route) and the page's own `Suspense` boundary around `TransactionResults`
 * (the fallback while filters/sort/page changes re-fetch), so both render
 * the exact same shape instead of two hand-maintained copies drifting apart.
 */
export function TransactionTableSkeleton() {
  return (
    <div className="rounded-md border">
      <Skeleton className="h-10 w-full rounded-b-none" />
      {PLACEHOLDER_ROWS.map((row) => (
        <Skeleton key={row} className="h-12 w-full rounded-none border-t" />
      ))}
    </div>
  );
}
