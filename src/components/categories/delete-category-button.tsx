"use client";

import { useState, useTransition } from "react";
import { CircleAlert, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { deleteCategory } from "@/lib/actions/categories";

type DeleteCategoryButtonProps = {
  categoryId: string;
};

/**
 * Confirm-then-soft-delete for one row of the category table.
 *
 * This is in-place async work, not a navigation: the row disappears from the
 * page the user is already on. So it takes local pending state on the control
 * itself and never a route-level skeleton or the full-screen overlay — see
 * `.claude/rules/navigation-loading.md`'s "What this does not cover".
 *
 * `deleteCategory` already calls `revalidatePath`, and a Server Action invoked
 * inside `startTransition` re-renders the current route with the revalidated
 * payload, so the list refreshes without an explicit `router.refresh()`.
 */
export function DeleteCategoryButton({ categoryId }: DeleteCategoryButtonProps) {
  const t = useTranslations("categories");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    setError(null);
    // `startTransition` is how a Server Action is invoked from an event
    // handler rather than a `<form action>` — see the Server Actions guide.
    startTransition(async () => {
      const result = await deleteCategory(categoryId);

      if (!result.success) {
        // Already a translated, renderable string from the server; there is no
        // second lookup step here. Kept inside the dialog so the failure is
        // attached to the action the user just took.
        setError(result.error);
        return;
      }

      setOpen(false);
    });
  }

  // Ignores close requests while the delete is in flight, so the dialog cannot
  // be dismissed out from under a pending action (and its error, if the action
  // fails, still has somewhere to render).
  function handleOpenChange(next: boolean) {
    if (isPending) return;
    setOpen(next);
    if (!next) setError(null);
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>
        <Trash2 data-icon="inline-start" aria-hidden="true" />
        {t("actions.delete")}
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("deleteDialog.title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("deleteDialog.description")}</AlertDialogDescription>
        </AlertDialogHeader>

        {error && (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>{t("deleteDialog.cancel")}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={handleConfirm} disabled={isPending}>
            {isPending ? t("deleteDialog.confirming") : t("deleteDialog.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
