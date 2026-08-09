"use client";

import Link, { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";

import { FullscreenLoader } from "@/components/ui/fullscreen-loader";

/**
 * `useLinkStatus` only works inside a `<Link>` descendant, which is why this
 * is a separate component rather than a hook call in `AppLink` itself.
 */
function PendingOverlay() {
  const { pending } = useLinkStatus();
  if (!pending) return null;

  // pointer-events-none: this overlay is a descendant of the anchor, so a
  // click landing on it would re-trigger the same navigation.
  return <FullscreenLoader className="pointer-events-none" />;
}

/**
 * A `next/link` that shows a full-screen loader while the destination is being
 * fetched.
 *
 * `loading.tsx` alone is not enough: its fallback is itself prefetched, so on a
 * cold or slow link the user gets no feedback between the click and the
 * navigation. This closes that gap. Use it for in-app navigation instead of
 * `next/link` — see `.claude/rules/navigation-loading.md`.
 */
function AppLink({ children, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link {...props}>
      {children}
      <PendingOverlay />
    </Link>
  );
}

export { AppLink };
