"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRouter } from "@/i18n/navigation";

/**
 * Slugs better-auth appends to `?error=` when it redirects a failure here.
 * See `onAPIError.errorURL` in `src/lib/auth.ts`. Each has a matching entry
 * under `auth.errorDialog` in every catalog.
 */
const KNOWN_SLUGS = ["account_not_linked", "state_mismatch"] as const;

type KnownSlug = (typeof KNOWN_SLUGS)[number];

function isKnownSlug(value: string): value is KnownSlug {
  return (KNOWN_SLUGS as readonly string[]).includes(value);
}

/**
 * Turns an auth failure redirect into an explanation on the login page.
 *
 * Any `?error=` slug opens the dialog: a slug we do not recognise still beats
 * silently swallowing a failed sign-in, and better-auth's list grows between
 * releases.
 */
export function AuthErrorDialog() {
  const t = useTranslations("auth.errorDialog");
  const router = useRouter();
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const key = error ? (isKnownSlug(error) ? error : "fallback") : null;

  function dismiss() {
    // Drop the query string so a refresh — or a back-and-forward — does not
    // reopen the dialog. `replace` keeps it out of the history stack too.
    router.replace("/login");
  }

  return (
    <AlertDialog open={key !== null} onOpenChange={(next) => !next && dismiss()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{key && t(`${key}.title`)}</AlertDialogTitle>
          <AlertDialogDescription>{key && t(`${key}.description`)}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={dismiss}>{t("dismiss")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
