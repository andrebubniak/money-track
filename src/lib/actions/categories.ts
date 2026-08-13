"use server";

import { cookies, headers } from "next/headers";
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
 * The active locale, for `getTranslations`.
 *
 * A bare `getTranslations("…")` **throws** in here. `src/i18n/request.ts`
 * resolves the locale from `next/root-params`, and root params are only
 * readable while rendering a route — inside a Server Action Next raises
 * "`import('next/root-params').locale()` was used inside a Server Action",
 * which takes the whole action down with it. Passing an explicit `locale` to
 * `getTranslations` makes next-intl skip that lookup entirely.
 *
 * Fixing it in `request.ts` instead is not an option: telling "no route
 * context" apart from a prerender bail-out there means catching broadly, and a
 * broad catch swallows the postpone signal that keeps `/[locale]` statically
 * rendered. Measured — it turns every `●` in the build output into `ƒ`.
 *
 * NEXT_LOCALE is the right source. Its name is pinned in `src/i18n/routing.ts`
 * precisely so app code may read it; the proxy carries it onto its own
 * redirects and the locale switcher's `syncLocaleCookie` keeps it current.
 * Falling back to the default locale only matters for a request that somehow
 * carries no cookie, where an English message beats a thrown action.
 */
async function getRequestLocale(): Promise<Locale> {
  const cookieName =
    typeof routing.localeCookie === "object" ? routing.localeCookie.name : undefined;
  const value = cookieName ? (await cookies()).get(cookieName)?.value : undefined;

  return hasLocale(routing.locales, value) ? value : routing.defaultLocale;
}

/**
 * One error message covers both "no session" and "not your category" (or
 * nonexistent) cases across all three actions — deliberately not telling the
 * caller which case it was.
 */
async function notFoundError(): Promise<ActionResult> {
  const t = await getTranslations({
    locale: await getRequestLocale(),
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
async function invalidInputError(): Promise<ActionResult> {
  const t = await getTranslations({
    locale: await getRequestLocale(),
    namespace: "categories",
  });
  return { success: false, error: t("invalidInput") };
}

async function parseValues(values: CategoryValues) {
  const t = await getTranslations({
    locale: await getRequestLocale(),
    namespace: "validation.categories",
  });
  return createCategorySchema(t).safeParse(values);
}

export async function createCategory(values: CategoryValues): Promise<ActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return notFoundError();

  const parsed = await parseValues(values);
  if (!parsed.success) return invalidInputError();

  const activeCount = await prisma.category.count({
    where: { userId, deactivatedAt: null },
  });
  if (activeCount >= MAX_ACTIVE_CATEGORIES) {
    const t = await getTranslations({
      locale: await getRequestLocale(),
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

export async function updateCategory(id: string, values: CategoryValues): Promise<ActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return notFoundError();

  // `id` is a bare Server Action argument — validate its shape before it
  // ever reaches a query. A malformed id can't match a real row anyway, so
  // this collapses into the same not-found response as any other case.
  if (!categoryIdSchema.safeParse(id).success) return notFoundError();

  const parsed = await parseValues(values);
  if (!parsed.success) return invalidInputError();

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

  if (!categoryIdSchema.safeParse(id).success) return notFoundError();

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
