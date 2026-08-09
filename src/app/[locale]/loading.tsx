import { FullscreenLoader } from "@/components/ui/fullscreen-loader";

/**
 * Route-level Suspense fallback for every segment under `app/`.
 *
 * Next prefetches this fallback, so it appears the instant a navigation starts
 * — but only once the request is actually in flight. For the case where
 * prefetching has not finished yet, `AppLink` shows the same loader from the
 * click itself. See `.claude/rules/navigation-loading.md`.
 */
export default function Loading() {
  return <FullscreenLoader />;
}
