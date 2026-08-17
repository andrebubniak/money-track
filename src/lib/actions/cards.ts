"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { hasLocale, type Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { routing } from "@/i18n/routing";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createCardSchema, MAX_ACTIVE_CARDS, type CardValues } from "@/lib/validations/card";

export type ActionResult = { success: true } | { success: false; error: string };

/**
 * `updateCard`/`deleteCard` receive `id` as a bare Server Action argument,
 * deserialized straight from an attacker-controlled POST body. Bounded the
 * same way `categoryIdSchema` is in `src/lib/actions/categories.ts` — a
 * `@default(cuid())` id is 25 characters; 30 leaves a little headroom.
 */
const CARD_ID_MAX_LENGTH = 30;
const cardIdSchema = z.string().trim().min(1).max(CARD_ID_MAX_LENGTH);

/**
 * Re-derives identity from the session on every call — never trust a
 * client-supplied id's ownership. Returns `null` when there is no session,
 * which every action below treats as a hard stop before touching the
 * database.
 */
async function getSessionUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

/**
 * Every action here takes the active `locale` as its last argument. See the
 * long comment on `resolveLocale` in `src/lib/actions/categories.ts` for why
 * a bare `getTranslations("…")`/`getLocale()` throws inside a Server Action,
 * and why the `NEXT_LOCALE` cookie can't substitute for this argument
 * either — the same reasoning applies here verbatim.
 */
function resolveLocale(locale: string): Locale {
  return hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
}

/**
 * One error message covers both "no session" and "not your card" (or
 * nonexistent) across all three actions — deliberately not telling the
 * caller which case it was.
 */
async function notFoundError(locale: string): Promise<ActionResult> {
  const t = await getTranslations({ locale: resolveLocale(locale), namespace: "cards" });
  return { success: false, error: t("notFound") };
}

/**
 * Generic, translated fallback for a schema failure. Never surfaces
 * `parsed.error.issues[0].message` — a payload that bypasses the client
 * entirely (a forged POST with the wrong shape) fails zod's own type check
 * first and produces zod's hardcoded English message, which would otherwise
 * reach the UI untranslated.
 */
async function invalidInputError(locale: string): Promise<ActionResult> {
  const t = await getTranslations({ locale: resolveLocale(locale), namespace: "cards" });
  return { success: false, error: t("invalidInput") };
}

async function parseValues(values: CardValues, locale: string) {
  const t = await getTranslations({ locale: resolveLocale(locale), namespace: "validation.cards" });
  return createCardSchema(t).safeParse(values);
}

export async function createCard(values: CardValues, locale: string): Promise<ActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return notFoundError(locale);

  const parsed = await parseValues(values, locale);
  if (!parsed.success) return invalidInputError(locale);

  const activeCount = await prisma.card.count({ where: { userId, deactivatedAt: null } });
  if (activeCount >= MAX_ACTIVE_CARDS) {
    const t = await getTranslations({ locale: resolveLocale(locale), namespace: "cards" });
    return { success: false, error: t("limitReached", { max: MAX_ACTIVE_CARDS }) };
  }

  await prisma.card.create({
    data: { userId, name: parsed.data.name, type: parsed.data.type },
  });

  revalidatePath("/[locale]/cards", "page");
  return { success: true };
}

export async function updateCard(
  id: string,
  values: CardValues,
  locale: string,
): Promise<ActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return notFoundError(locale);

  if (!cardIdSchema.safeParse(id).success) return notFoundError(locale);

  const parsed = await parseValues(values, locale);
  if (!parsed.success) return invalidInputError(locale);

  // Ownership re-derived from the session's userId, never trusted from the
  // client. Not found (wrong owner or nonexistent) is the same error either
  // way.
  const card = await prisma.card.findFirst({ where: { id, userId } });
  if (!card) return notFoundError(locale);

  await prisma.card.update({
    where: { id },
    data: { name: parsed.data.name, type: parsed.data.type },
  });

  revalidatePath("/[locale]/cards", "page");
  return { success: true };
}

export async function deleteCard(id: string, locale: string): Promise<ActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return notFoundError(locale);

  if (!cardIdSchema.safeParse(id).success) return notFoundError(locale);

  const card = await prisma.card.findFirst({ where: { id, userId } });
  if (!card) return notFoundError(locale);

  // Soft delete — never a hard delete. `Transaction.cardId` and
  // `RecurringTransaction.cardId` reference this row with `onDelete:
  // Restrict`, so a hard delete would fail outright once any transaction
  // references the card; deactivating keeps every reference valid.
  await prisma.card.update({ where: { id }, data: { deactivatedAt: new Date() } });

  revalidatePath("/[locale]/cards", "page");
  return { success: true };
}
