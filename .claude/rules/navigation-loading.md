# Navigation Loading Guideline

Every in-app navigation that is not already prefetched must show a full-screen
loading state. A click that produces no visible response for half a second
reads as a broken button, and users click again.

## Use `AppLink`, not `next/link`

`src/components/nav/app-link.tsx` wraps `next/link` and shows
`FullscreenLoader` while the destination is being fetched.

```tsx
import { AppLink } from "@/components/nav/app-link";

<AppLink href="/register">Sign up</AppLink>
```

Use it for **all** internal navigation. Reach for a bare `next/link` only when
you have a specific reason and can say what it is — a link inside a tight list
where an overlay would be wrong, for instance.

External links (`<a href="https://…">`) are unaffected; there is nothing to
prefetch and no client transition to cover.

## Why `loading.tsx` alone is not enough

`src/app/loading.tsx` provides the route-level Suspense fallback, and it is the
right tool once a navigation is under way. But **Next prefetches the fallback
itself**. On a cold link — first visit, slow network, a route not yet compiled
in development — the fallback has not arrived either, so the user gets nothing
between the click and the transition.

`AppLink` closes that gap using `useLinkStatus` from `next/link`, which reports
pending state from the moment of the click. The two mechanisms are
complementary; keep both.

`useLinkStatus` only works inside a `<Link>` descendant, which is why
`PendingOverlay` is a separate component rather than a hook call in `AppLink`.

## The loader must not flash

`FullscreenLoader` starts fully transparent and fades in after **150ms**
(`[animation-delay:150ms]` with `[animation-fill-mode:both]`). Navigations that
complete quickly finish before it is ever visible.

Do not remove that delay. An overlay that flickers on every fast navigation is
worse than no overlay.

## Adding a new route

1. If a segment needs a different loading treatment — a skeleton matching its
   layout rather than a centred spinner — add a `loading.tsx` to that segment.
   It overrides the root one for that subtree.
2. Link to it with `AppLink`.
3. Nothing else. Do not add per-page `useState` loading flags for navigation;
   that is what these two mechanisms are for.

## What this does not cover

This is about **navigation**. In-place async work — submitting a form, signing
out — uses local pending state on the control itself, disabling it and swapping
its label (`"Sign in"` → `"Signing in…"`). Do not put a full-screen overlay over
a form submission; the user needs to keep seeing what they typed.
