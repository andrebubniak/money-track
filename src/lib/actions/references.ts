import { prisma } from "@/lib/prisma";

/**
 * A `categoryId`/`cardId` arrives off a POST body like any other argument, so
 * being a real id is not enough — it has to be one of *this* user's, and
 * still active. A soft-deleted category must not become newly referenced.
 *
 * Returns false for "not yours", "doesn't exist", and "deactivated" alike;
 * the caller turns all three into the same generic error.
 */
export async function ownsReferences(
  userId: string,
  categoryId: string,
  cardId: string | null,
): Promise<boolean> {
  const [category, card] = await Promise.all([
    prisma.category.findFirst({
      where: { id: categoryId, userId, deactivatedAt: null },
      select: { id: true },
    }),
    cardId
      ? prisma.card.findFirst({
          where: { id: cardId, userId, deactivatedAt: null },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  if (!category) return false;
  return !cardId || Boolean(card);
}
