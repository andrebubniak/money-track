import { Skeleton } from "@/components/ui/skeleton";

/**
 * In-shell loading state.
 *
 * Renders inside `SidebarInset`, so the sidebar stays visible and interactive
 * while only the content area swaps — the skeleton pattern described in
 * `.claude/rules/navigation-loading.md`. The full-screen overlay is for
 * entering the shell, not for moving around inside it.
 *
 * Mirror the real page's layout here as `/dashboard` grows, or the content
 * will jump when it arrives.
 */
export default function DashboardLoading() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2.5 px-5 py-10">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-48" />
      <Skeleton className="mt-4 h-16 w-80" />
      <span className="sr-only">Loading…</span>
    </main>
  );
}
