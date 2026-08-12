import createIntlMiddleware from "next-intl/middleware";
import { hasLocale } from "next-intl";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

import { stripUnknownLocale } from "@/i18n/locale-segment";
import { routing } from "@/i18n/routing";

const handleLocaleRouting = createIntlMiddleware(routing);

/**
 * Paths that require a session, written without their locale prefix. Add to
 * this list as protected segments are introduced.
 */
const PROTECTED_PATHS = ["/dashboard"];

/**
 * Splits `/de-DE/dashboard` into its locale and the rest. Falls back to the
 * default locale for an unprefixed path, which only happens on requests the
 * locale middleware is about to redirect anyway.
 */
function splitLocale(pathname: string) {
  const [, first, ...others] = pathname.split("/");

  return hasLocale(routing.locales, first)
    ? { locale: first, path: `/${others.join("/")}` }
    : { locale: routing.defaultLocale, path: pathname };
}

/**
 * Moves any cookie the locale middleware set — most importantly NEXT_LOCALE —
 * onto a redirect of our own. A bare redirect would drop it and the negotiated
 * locale would have to be worked out again on the next request.
 */
function carryCookies(target: NextResponse, source: NextResponse) {
  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie);
  }
  return target;
}

/**
 * `/abc/dashboard` → `/en-US/dashboard`, rather than next-intl's default of
 * prefixing the bogus segment into `/en-US/abc/dashboard` and 404ing.
 *
 * The shortened path is handed to next-intl so its own resolution order —
 * NEXT_LOCALE cookie, then Accept-Language, then the default — decides the
 * replacement. Nothing here reimplements that.
 *
 * Returns `undefined` when the path needs no coercion, which is every
 * well-formed request.
 */
function coerceUnknownLocale(request: NextRequest) {
  const stripped = stripUnknownLocale(request.nextUrl.pathname);
  if (stripped === null) return undefined;

  const url = request.nextUrl.clone();
  url.pathname = stripped;

  const response = handleLocaleRouting(new NextRequest(url, request));
  if (response.headers.has("location")) return response;

  // The stripped path already carried a valid locale — `/abc/de-DE/login`.
  // next-intl saw nothing to correct, so the browser is still sitting on the
  // bogus URL and we have to move it ourselves.
  return carryCookies(NextResponse.redirect(url), response);
}

// The auth check here is NOT a security boundary. It only checks that a
// session cookie exists — a hand-forged cookie passes it. Its only job is
// skipping a wasted render for signed-out visitors. The real check is
// auth.api.getSession() inside app/[locale]/dashboard/page.tsx.
export function proxy(request: NextRequest) {
  const coerced = coerceUnknownLocale(request);
  if (coerced) return coerced;

  const response = handleLocaleRouting(request);

  // The path carried no locale prefix, so this is a redirect to the negotiated
  // one. Nothing to guard yet — the request comes back through here prefixed.
  if (response.headers.has("location")) return response;

  const { locale, path } = splitLocale(request.nextUrl.pathname);

  if (!PROTECTED_PATHS.includes(path)) return response;
  if (getSessionCookie(request)) return response;

  const url = request.nextUrl.clone();
  url.pathname = `/${locale}/login`;

  return carryCookies(NextResponse.redirect(url), response);
}

export const config = {
  // Everything except API routes, Next internals, and anything with a file
  // extension. `api` must stay excluded: better-auth's endpoint at
  // /api/auth/[...all] lives outside the [locale] segment by design.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
