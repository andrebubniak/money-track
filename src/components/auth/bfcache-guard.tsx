"use client";

import { useEffect } from "react";

/**
 * Forces a reload when this page is restored from the back/forward cache.
 *
 * `Cache-Control: no-store` (see `next.config.ts`) is the primary defence and
 * covers Chrome and Firefox. This is the backstop: bfcache eligibility is a
 * browser heuristic, Safari has historically been more willing to restore
 * pages regardless, and a restored auth form is a page whose session guard
 * never ran.
 *
 * `event.persisted` is true only for a bfcache restore, so a normal load never
 * pays for this. On restore the reload hits the server, the guard runs, and a
 * signed-in user is sent to the dashboard.
 */
export function BfcacheGuard() {
  useEffect(() => {
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) window.location.reload();
    }

    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  return null;
}
