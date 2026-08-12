"use client";

import { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";
import { createPortal } from "react-dom";

import { Link } from "@/i18n/navigation";
import { FullscreenLoader } from "@/components/ui/fullscreen-loader";

/**
 * `useLinkStatus` only works inside a `<Link>` descendant, which is why this
 * is a separate component rather than a hook call in `AppLink` itself.
 */
function PendingOverlay() {
  const { pending } = useLinkStatus();
  if (!pending) return null;

  // Portalled to <body> rather than rendered in place. Links routinely sit
  // inside a <p> — "Don't have an account? Sign up" — and a <div> inside a
  // <p> is invalid HTML that React 19 rejects with a hydration error. The
  // portal also lifts the overlay out of any ancestor's stacking or overflow
  // context, and stops a click on it from re-triggering its own anchor.
  return createPortal(<FullscreenLoader />, document.body);
}

/**
 * A `next/link` that shows a full-screen loader while the destination is being
 * fetched.
 *
 * `loading.tsx` alone is not enough: its fallback is itself prefetched, so on a
 * cold or slow link the user gets no feedback between the click and the
 * navigation. This closes that gap. Use it for in-app navigation instead of
 * `next/link` — see `.claude/rules/navigation-loading.md`.
 *
 * Wraps next-intl's `Link`, so `href="/register"` resolves to the active
 * locale automatically.
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
