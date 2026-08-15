"use client";

import { useState, useTransition } from "react";
import { CircleAlert, EllipsisVertical, SquarePen, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

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
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLinkItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Link } from "@/i18n/navigation";
import { deleteCategory } from "@/lib/actions/categories";

type CategoryRowActionsProps = {
  categoryId: string;
};

/**
 * One row's actions: an ellipsis-vertical trigger opening a dropdown with
 * "Edit" and "Delete", per the color-coded-actions pattern in
 * `.claude/rules/ui.md`.
 *
 * The confirm-then-soft-delete dialog is the same in-place async work
 * `DeleteCategoryButton` used to own — local pending state on the control,
 * never a route-level skeleton, per `.claude/rules/navigation-loading.md`'s
 * "What this does not cover". It lives here now because Base UI menu items
 * close the menu on click, which would unmount an `AlertDialogTrigger`
 * nested inside one before its dialog ever opened — so the dialog is fully
 * controlled from this component instead, opened by the item's `onClick`.
 */
export function CategoryRowActions({ categoryId }: CategoryRowActionsProps) {
  const t = useTranslations("categories");
  // Passed to the action explicitly: a Server Action cannot resolve the locale
  // itself — see the header comment in `src/lib/actions/categories.ts`.
  const locale = useLocale();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirmDelete() {
    setError(null);
    // `startTransition` is how a Server Action is invoked from an event
    // handler rather than a `<form action>` — see the Server Actions guide.
    startTransition(async () => {
      const result = await deleteCategory(categoryId, locale);

      if (!result.success) {
        // Already a translated, renderable string from the server; there is no
        // second lookup step here. Kept inside the dialog so the failure is
        // attached to the action the user just took.
        setError(result.error);
        return;
      }

      setDeleteOpen(false);
    });
  }

  // Ignores close requests while the delete is in flight, so the dialog cannot
  // be dismissed out from under a pending action (and its error, if the action
  // fails, still has somewhere to render).
  function handleDeleteOpenChange(next: boolean) {
    if (isPending) return;
    setDeleteOpen(next);
    if (!next) setError(null);
  }

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger
            render={
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="icon" aria-label={t("table.actions")} />}
              />
            }
          >
            <EllipsisVertical aria-hidden="true" className="size-6" />
          </TooltipTrigger>
          <TooltipContent>{t("table.actions")}</TooltipContent>
        </Tooltip>

        <DropdownMenuContent align="end">
          <DropdownMenuLinkItem
            variant="info"
            render={<Link href={`/dashboard/categories/${categoryId}/edit`} />}
          >
            <SquarePen aria-hidden="true" className="size-6" />
            {t("actions.edit")}
          </DropdownMenuLinkItem>
          <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 aria-hidden="true" className="size-6" />
            {t("actions.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={deleteOpen} onOpenChange={handleDeleteOpenChange}>
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
            <AlertDialogAction variant="destructive" onClick={handleConfirmDelete} disabled={isPending}>
              {isPending ? t("deleteDialog.confirming") : t("deleteDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
