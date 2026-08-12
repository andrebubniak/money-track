import { defineRouting } from "next-intl/routing";

/**
 * The single source of truth for supported locales. Nothing else in the app
 * hard-codes this list — `src/proxy.ts`, the layout's `generateStaticParams`,
 * and the catalog parity test all read it from here.
 */
export const routing = defineRouting({
  locales: ["en-US", "pt-BR", "de-DE"],
  defaultLocale: "en-US",

  // Every URL carries its locale, so a shared link renders identically for
  // everyone and no route has two addresses. `/` redirects to `/{negotiated}`.
  localePrefix: "always",

  // Pinned rather than inherited. This name is about to become part of the
  // app's own contract — a locale switcher will write it — so a next-intl
  // upgrade must not be able to move it silently.
  localeCookie: { name: "NEXT_LOCALE", maxAge: 60 * 60 * 24 * 365 },
});
