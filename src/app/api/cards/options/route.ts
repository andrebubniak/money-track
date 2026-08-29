import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { OPTIONS_PAGE_SIZE, parseOptionsParams } from "@/lib/options";
import { prisma } from "@/lib/prisma";

/**
 * Unlike categories, a card's `name` is always literal text, so searching and
 * ordering happen in SQL — matching how `/cards` already orders. One extra
 * row is fetched to tell whether another page exists without a second count.
 */
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response(null, { status: 401 });

  const { q, page } = parseOptionsParams(new URL(request.url));

  const cards = await prisma.card.findMany({
    where: {
      userId: session.user.id,
      deactivatedAt: null,
      ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    skip: (page - 1) * OPTIONS_PAGE_SIZE,
    take: OPTIONS_PAGE_SIZE + 1,
  });

  return Response.json({
    items: cards.slice(0, OPTIONS_PAGE_SIZE),
    hasMore: cards.length > OPTIONS_PAGE_SIZE,
  });
}
