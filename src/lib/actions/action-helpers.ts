import { headers } from "next/headers";
import { hasLocale, type Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { routing } from "@/i18n/routing";
import { auth } from "@/lib/auth";
import { TRANSACTION_ID_MAX_LENGTH } from "@/lib/validations/transaction";

/**
 * Deliberately not a `"use server"` module. Every export of one becomes a
 * callable Server Action endpoint, so these helpers could not live beside
 * the actions without being exposed over the network — and each action file
 * would have to re-declare all five. `cards.ts` and `categories.ts` predate
 * this file and still carry their own copies; leave them be.
 */
export type ActionResult = { success: true } | { success: false; error: string };

/** An id arrives deserialized straight from an attacker-controlled POST body. */
export const transactionIdSchema = z.string().trim().min(1).max(TRANSACTION_ID_MAX_LENGTH);

/**
 * Re-derives identity from the session on every call — never trust a
 * client-supplied id's ownership.
 */
export async function getSessionUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

/**
 * Every action takes the active `locale` as its last argument — see the
 * header comment in `src/lib/actions/cards.ts` for why `getLocale()` throws
 * inside a Server Action and why the `NEXT_LOCALE` cookie cannot stand in.
 */
export function resolveLocale(locale: string): Locale {
  return hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
}

/** One message for "no session", "not yours", and "doesn't exist" alike. */
export async function notFoundError(locale: string): Promise<ActionResult> {
  const t = await getTranslations({ locale: resolveLocale(locale), namespace: "transactions" });
  return { success: false, error: t("notFound") };
}

/**
 * Never surfaces `parsed.error.issues[0].message`: a forged payload of the
 * wrong *type* fails zod's own check first and would reach the UI as
 * hardcoded English.
 */
export async function invalidInputError(locale: string): Promise<ActionResult> {
  const t = await getTranslations({ locale: resolveLocale(locale), namespace: "transactions" });
  return { success: false, error: t("invalidInput") };
}
