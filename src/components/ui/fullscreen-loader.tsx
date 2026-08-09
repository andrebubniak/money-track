import { LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Full-viewport loading state shown while a route is being fetched.
 *
 * The 150ms animation delay with `fill-mode-both` means the overlay starts
 * fully transparent and only becomes visible if the navigation is actually
 * slow. Fast, already-prefetched navigations complete before it ever appears,
 * so the user never sees a flash.
 */
function FullscreenLoader({
  label = "Loading…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background",
        "animate-in fade-in-0 [animation-delay:150ms] [animation-fill-mode:both]",
        className,
      )}
    >
      <LoaderCircle className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

export { FullscreenLoader };
