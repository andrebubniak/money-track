import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";

import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

/**
 * The app has no marketing home page — `/` is the dashboard.
 *
 * Signed-out visitors land on `/dashboard`, whose own session check bounces
 * them to `/login`, so this needs no auth logic of its own.
 */
export default async function Home({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  // Next generates `locale` as a plain `string`; `hasLocale` narrows it to
  // next-intl's `Locale` union, which `redirect` requires. The layout above
  // already 404s on anything outside `routing.locales`, so this is never
  // actually reached with an unsupported tag.
  if (!hasLocale(routing.locales, locale)) notFound();
  redirect({ href: "/dashboard", locale });
}
