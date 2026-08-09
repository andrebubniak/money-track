"use client";

import { useRouter, useSearchParams } from "next/navigation";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Explains why a Google sign-in was refused.
 *
 * better-auth will not link a Google identity to an account that was created
 * with a password, because that password account was never proven to belong to
 * whoever registered it. Rather than dumping the user on better-auth's own
 * unstyled `/api/auth/error` page, `GoogleButton` sends failures back here with
 * `?error=<slug>` and this explains what to do instead.
 */
export function AccountNotLinkedDialog() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const open = searchParams.get("error") === "account_not_linked";

  function dismiss() {
    // Drop the query string so a refresh — or a back-and-forward — does not
    // reopen the dialog. `replace` keeps it out of the history stack too.
    router.replace("/login");
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && dismiss()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>This email already uses a password</AlertDialogTitle>
          <AlertDialogDescription>
            This email is already registered with the password method. Please
            sign in with your email and password instead of Google.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={dismiss}>Got it</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
