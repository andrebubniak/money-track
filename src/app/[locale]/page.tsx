import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";

/**
 * The app has no marketing home page — `/` is the dashboard.
 *
 * Signed-out visitors land on `/dashboard`, whose own session check bounces
 * them to `/login`, so this needs no auth logic of its own.
 */
export default async function Home() {
  const locale = await getLocale();
  redirect({ href: "/dashboard", locale });
}
