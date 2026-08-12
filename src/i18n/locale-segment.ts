import { routing } from "./routing";

/**
 * A path segment shaped like a BCP 47 language tag: two or three letters,
 * optionally followed by `-` subtags. Matches `en`, `abc`, `pt-BR`,
 * `zh-Hans-CN`. Does not match `dashboard`, `login`, `register`.
 *
 * This is a shape test, not a validity test. `abc` is not a real language and
 * that is deliberate: someone hand-editing the locale in the URL should land
 * somewhere useful rather than on a 404.
 *
 * The cost is that a top-level route whose first hyphen-delimited part is two
 * or three letters — `/faq`, but also `/tx-import`, `/co-owners`,
 * `/faq-page` — would be swallowed. `locale-segment.spec.ts` walks
 * `src/app/[locale]/` and fails the day one is added, so this cannot break
 * silently.
 */
const LOCALE_SHAPED = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i;

export function isLocaleShaped(segment: string): boolean {
  return LOCALE_SHAPED.test(segment);
}

/**
 * Removes a leading segment that looks like a language tag but is not one of
 * ours, so `/abc/dashboard` becomes `/dashboard`. Returns `null` when the path
 * should be left untouched, which is every well-formed request.
 *
 * Supported locales are matched case-insensitively and left in place on
 * purpose: next-intl already redirects `/en-us/…` to the canonical `/en-US/…`,
 * and stripping it here would replace that correction with a fallback.
 */
export function stripUnknownLocale(pathname: string): string | null {
  const [, first, ...rest] = pathname.split("/");

  if (!first || !isLocaleShaped(first)) return null;

  const isSupported = routing.locales.some(
    (locale) => locale.toLowerCase() === first.toLowerCase(),
  );
  if (isSupported) return null;

  return `/${rest.join("/")}`;
}
