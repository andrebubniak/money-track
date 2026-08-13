"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createCategorySchema, type CategoryValues } from "@/lib/validations/category";

export type ActionResult = { success: true } | { success: false; error: string };

/**
 * Counted against `deactivatedAt: null` rows only — a soft-deleted category
 * frees a slot. See createCategory.
 */
const MAX_ACTIVE_CATEGORIES = 50;

/**
 * Re-derives identity from the session on every call, the same authoritative
 * check `dashboard/page.tsx` makes — never trust a client-supplied id's
 * ownership. Returns `null` when there is no session, which every action
 * below treats as a hard stop before touching the database.
 */
async function getSessionUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

/**
 * One error message covers both "no session" and "not your category" (or
 * nonexistent) cases across all three actions — deliberately not telling the
 * caller which case it was.
 */
async function notFoundError(): Promise<ActionResult> {
  const t = await getTranslations("categories");
  return { success: false, error: t("notFound") };
}

async function parseValues(values: CategoryValues) {
  const t = await getTranslations("validation.categories");
  return createCategorySchema(t).safeParse(values);
}

export async function createCategory(values: CategoryValues): Promise<ActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return notFoundError();

  const parsed = await parseValues(values);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const activeCount = await prisma.category.count({
    where: { userId, deactivatedAt: null },
  });
  if (activeCount >= MAX_ACTIVE_CATEGORIES) {
    const t = await getTranslations("categories");
    return { success: false, error: t("limitReached") };
  }

  await prisma.category.create({
    data: {
      userId,
      name: parsed.data.name,
      icon: parsed.data.icon,
      description: parsed.data.description ?? null,
    },
  });

  revalidatePath("/[locale]/dashboard/categories", "page");
  return { success: true };
}

export async function updateCategory(id: string, values: CategoryValues): Promise<ActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return notFoundError();

  const parsed = await parseValues(values);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  // Ownership re-derived from the session's userId, never trusted from the
  // client. Not found (wrong owner or nonexistent) is the same error either
  // way.
  const category = await prisma.category.findFirst({ where: { id, userId } });
  if (!category) return notFoundError();

  await prisma.category.update({
    where: { id },
    data: {
      name: parsed.data.name,
      icon: parsed.data.icon,
      description: parsed.data.description ?? null,
      // Unconditionally nulled. If it was already null this is a no-op; if
      // the row was still linked to a preset, any successful edit unlinks
      // it — even when the submitted values equal what the preset already
      // resolved to display.
      systemLocaleKey: null,
    },
  });

  revalidatePath("/[locale]/dashboard/categories", "page");
  return { success: true };
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return notFoundError();

  const category = await prisma.category.findFirst({ where: { id, userId } });
  if (!category) return notFoundError();

  // Soft delete — never a hard delete — so transactions and recurring
  // transactions referencing this category keep pointing at a real row.
  await prisma.category.update({
    where: { id },
    data: { deactivatedAt: new Date() },
  });

  revalidatePath("/[locale]/dashboard/categories", "page");
  return { success: true };
}
