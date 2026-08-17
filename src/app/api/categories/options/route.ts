import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";

import { auth } from "@/lib/auth";
import { resolveCategoryDisplay } from "@/lib/category-display";
import { pageOf, parseOptionsParams } from "@/lib/options";
import { prisma } from "@/lib/prisma";

/**
 * Searching and sorting happen in application code, not SQL: a preset
 * category stores English text in `name` and is translated at render time, so
 * the database would match and order on words the user never sees. Loading
 * every row first is affordable because categories are capped at 50 per user
 * — the same reason `/categories` sorts in application code.
 */
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response(null, { status: 401 });

  const { q, page, locale } = parseOptionsParams(new URL(request.url));

  const categories = await prisma.category.findMany({
    where: { userId: session.user.id, deactivatedAt: null },
    select: { id: true, name: true, description: true, systemLocaleKey: true },
  });

  const t = await getTranslations({ locale, namespace: "categories.presets" });
  const collator = new Intl.Collator(locale);
  const needle = q.toLocaleLowerCase(locale);

  const items = categories
    .map((category) => ({
      id: category.id,
      name: resolveCategoryDisplay(category, t).name,
    }))
    .filter((option) => option.name.toLocaleLowerCase(locale).includes(needle))
    .sort((a, b) => collator.compare(a.name, b.name));

  return Response.json(pageOf(items, page));
}
