import { LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";

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
  label,
  className,
}: {
  label?: string;
  className?: string;
}) {
  // Rendered from both a Server Component (loading.tsx) and a Client one
  // (AppLink's portal). `useTranslations` works in both.
  const t = useTranslations("common");

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
      <span className="text-sm text-muted-foreground">{label ?? t("loading")}</span>
    </div>
  );
}

export { FullscreenLoader };
