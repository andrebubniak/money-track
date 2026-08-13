"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { hasLocale, type Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { routing } from "@/i18n/routing";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createCategorySchema,
  MAX_ACTIVE_CATEGORIES,
  type CategoryValues,
} from "@/lib/validations/category";

export type ActionResult = { success: true } | { success: false; error: string };

/**
 * `updateCategory`/`deleteCategory` receive `id` as a bare Server Action
 * argument, deserialized straight from an attacker-controlled POST body — the
 * `string` type annotation on the exported functions enforces nothing at
 * runtime. Bounded the same way every other string field is (see
 * `.claude/rules/validation.md`) so an unbounded value never reaches Prisma.
 * `@default(cuid())` in schema.prisma produces a 25-character id; 30 leaves a
 * little headroom without leaving the field unbounded.
 */
const CATEGORY_ID_MAX_LENGTH = 30;
const categoryIdSchema = z.string().trim().min(1).max(CATEGORY_ID_MAX_LENGTH);

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
 * Every action here takes the active `locale` as its last argument, because a
 * Server Action has no other way to find it.
 *
 * A bare `getTranslations("…")` **throws** in this file.
 * `src/i18n/request.ts` resolves the locale from `next/root-params`, and root
 * params are only readable while rendering a route — inside a Server Action
 * Next raises "`import('next/root-params').locale()` was used inside a Server
 * Action", which takes the whole action down with it. The same goes for
 * `getLocale()`, which resolves through the same config. Passing an explicit
 * `locale` to `getTranslations` makes next-intl skip that lookup entirely.
 *
 * Fixing it in `request.ts` instead is not an option: telling "no route
 * context" apart from a prerender bail-out there means catching broadly, and a
 * broad catch swallows the postpone signal that keeps `/[locale]` statically
 * rendered. Measured — it turns every `●` in the build output into `ƒ`.
 *
 * Reading the NEXT_LOCALE cookie here does not work either, which is why the
 * argument exists. next-intl's middleware only writes that cookie when an
 * existing one is *outdated*, or when there is none and Accept-Language
 * *disagrees* with the resolved locale (`syncCookie` in
 * `node_modules/next-intl/dist/esm/development/middleware/syncCookie.js`). A
 * browser sending `Accept-Language: pt-BR` that lands on `/pt-BR/…` matches
 * neither branch, so no cookie is ever written and the read would silently
 * fall back to `en-US` — a Portuguese page rendering English errors. The
 * caller, which is a Client Component with `useLocale()` in hand, is the one
 * place that reliably knows.
 *
 * The value still arrives over the wire in a POST body, so it is validated
 * rather than trusted, exactly like `id` below.
 */
function resolveLocale(locale: string): Locale {
  return hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
}

/**
 * One error message covers both "no session" and "not your category" (or
 * nonexistent) cases across all three actions — deliberately not telling the
 * caller which case it was.
 */
async function notFoundError(locale: string): Promise<ActionResult> {
  const t = await getTranslations({
    locale: resolveLocale(locale),
    namespace: "categories",
  });
  return { success: false, error: t("notFound") };
}

/**
 * Generic, translated fallback for a schema failure. Deliberately never
 * surfaces `parsed.error.issues[0].message` — most issues are our own bounds
 * violations, translated via the schema factory, but a payload that bypasses
 * the client entirely (a forged POST with the wrong shape, e.g. `name` as a
 * number) fails zod's own type check first and produces zod's hardcoded
 * English message, which would otherwise reach the UI untranslated.
 */
async function invalidInputError(locale: string): Promise<ActionResult> {
  const t = await getTranslations({
    locale: resolveLocale(locale),
    namespace: "categories",
  });
  return { success: false, error: t("invalidInput") };
}

async function parseValues(values: CategoryValues, locale: string) {
  const t = await getTranslations({
    locale: resolveLocale(locale),
    namespace: "validation.categories",
  });
  return createCategorySchema(t).safeParse(values);
}

export async function createCategory(
  values: CategoryValues,
  locale: string,
): Promise<ActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return notFoundError(locale);

  const parsed = await parseValues(values, locale);
  if (!parsed.success) return invalidInputError(locale);

  const activeCount = await prisma.category.count({
    where: { userId, deactivatedAt: null },
  });
  if (activeCount >= MAX_ACTIVE_CATEGORIES) {
    const t = await getTranslations({
      locale: resolveLocale(locale),
      namespace: "categories",
    });
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

export async function updateCategory(
  id: string,
  values: CategoryValues,
  locale: string,
): Promise<ActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return notFoundError(locale);

  // `id` is a bare Server Action argument — validate its shape before it
  // ever reaches a query. A malformed id can't match a real row anyway, so
  // this collapses into the same not-found response as any other case.
  if (!categoryIdSchema.safeParse(id).success) return notFoundError(locale);

  const parsed = await parseValues(values, locale);
  if (!parsed.success) return invalidInputError(locale);

  // Ownership re-derived from the session's userId, never trusted from the
  // client. Not found (wrong owner or nonexistent) is the same error either
  // way.
  const category = await prisma.category.findFirst({ where: { id, userId } });
  if (!category) return notFoundError(locale);

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

export async function deleteCategory(id: string, locale: string): Promise<ActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return notFoundError(locale);

  if (!categoryIdSchema.safeParse(id).success) return notFoundError(locale);

  const category = await prisma.category.findFirst({ where: { id, userId } });
  if (!category) return notFoundError(locale);

  // Soft delete — never a hard delete — so transactions and recurring
  // transactions referencing this category keep pointing at a real row.
  await prisma.category.update({
    where: { id },
    data: { deactivatedAt: new Date() },
  });

  revalidatePath("/[locale]/dashboard/categories", "page");
  return { success: true };
}
