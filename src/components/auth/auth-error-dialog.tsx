"use client";

import { useSearchParams } from "next/navigation";

import { useRouter } from "@/i18n/navigation";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type AuthErrorCopy = { title: string; description: string };

/**
 * Slugs better-auth appends to `?error=` when it redirects a failure here.
 * See `onAPIError.errorURL` in `src/lib/auth.ts`.
 */
const AUTH_ERROR_COPY: Record<string, AuthErrorCopy> = {
  account_not_linked: {
    title: "This email already uses a password",
    description:
      "This email is already registered with the password method. Please sign in with your email and password instead of Google.",
  },
  // Raised when a finished Google sign-in is replayed — most often by pressing
  // Back into it — because its one-time state cookie has already been spent.
  state_mismatch: {
    title: "That sign-in link expired",
    description:
      "This sign-in attempt is no longer valid, usually because it was already completed or reopened from history. Please start again.",
  },
};

const FALLBACK_COPY: AuthErrorCopy = {
  title: "Sign-in didn't complete",
  description:
    "Something went wrong while signing you in. Please try again.",
};

/**
 * Turns an auth failure redirect into an explanation on the login page.
 *
 * Any `?error=` slug opens the dialog: a slug we do not recognise still beats
 * silently swallowing a failed sign-in, and better-auth's list grows between
 * releases.
 */
export function AuthErrorDialog() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const copy = error ? (AUTH_ERROR_COPY[error] ?? FALLBACK_COPY) : null;

  function dismiss() {
    // Drop the query string so a refresh — or a back-and-forward — does not
    // reopen the dialog. `replace` keeps it out of the history stack too.
    router.replace("/login");
  }

  return (
    <AlertDialog open={copy !== null} onOpenChange={(next) => !next && dismiss()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy?.title}</AlertDialogTitle>
          <AlertDialogDescription>{copy?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={dismiss}>Got it</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
