import createIntlMiddleware from "next-intl/middleware";
import { hasLocale } from "next-intl";
import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

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

// The auth check here is NOT a security boundary. It only checks that a
// session cookie exists — a hand-forged cookie passes it. Its only job is
// skipping a wasted render for signed-out visitors. The real check is
// auth.api.getSession() inside app/[locale]/dashboard/page.tsx.
export function proxy(request: NextRequest) {
  const response = handleLocaleRouting(request);

  // The path carried no locale prefix, so this is a redirect to the negotiated
  // one. Nothing to guard yet — the request comes back through here prefixed.
  if (response.headers.has("location")) return response;

  const { locale, path } = splitLocale(request.nextUrl.pathname);

  if (!PROTECTED_PATHS.includes(path)) return response;
  if (getSessionCookie(request)) return response;

  const url = request.nextUrl.clone();
  url.pathname = `/${locale}/login`;
  const redirect = NextResponse.redirect(url);

  // Carry over anything the locale middleware set — most importantly the
  // NEXT_LOCALE cookie. Returning a bare redirect would drop it, and the
  // negotiated locale would have to be worked out again on the next request.
  for (const cookie of response.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }

  return redirect;
}

export const config = {
  // Everything except API routes, Next internals, and anything with a file
  // extension. `api` must stay excluded: better-auth's endpoint at
  // /api/auth/[...all] lives outside the [locale] segment by design.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
