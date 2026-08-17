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
import { deleteRecurringTransaction } from "@/lib/actions/recurring-transactions";
import { deleteTransaction } from "@/lib/actions/transactions";
import type { TransactionListRow } from "@/lib/transactions/list-query";

type TransactionRowActionsProps = {
  row: TransactionListRow;
};

/**
 * One row's actions: an ellipsis-vertical trigger opening a dropdown with
 * "Edit" and "Delete" — the same pattern as `CardRowActions`, including why
 * the delete confirmation is a fully-controlled `AlertDialog` rather than a
 * nested `AlertDialogTrigger` (Base UI unmounts menu items on click, which
 * would unmount the trigger before its dialog ever opened).
 *
 * What differs from `CardRowActions` is the branching on `row.kind`: a
 * `single` row edits/deletes itself; a `recurring` row edits/deletes the
 * recurrence definition; an `installment` row has no edit page of its own —
 * its Edit opens the parent plan (`row.planId`) pointed at the occurrence —
 * and its Delete removes only that occurrence via `deleteTransaction`, never
 * the plan (deleting the whole plan is a separate action on the plan's own
 * edit page, where the occurrence count is on screen).
 */
export function TransactionRowActions({ row }: TransactionRowActionsProps) {
  const t = useTranslations("transactions");
  // Passed to the actions explicitly: a Server Action cannot resolve the
  // locale itself — see the header comment in `src/lib/actions/transactions.ts`.
  const locale = useLocale();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const editHref =
    row.kind === "recurring"
      ? `/transactions/recurring/${row.id}/edit`
      : row.kind === "installment"
        ? `/transactions/installments/${row.planId}/edit?occurrence=${row.id}`
        : `/transactions/${row.id}/edit`;

  const dialogCopy =
    row.kind === "recurring"
      ? { title: t("deleteDialog.recurringTitle"), description: t("deleteDialog.recurringDescription") }
      : { title: t("deleteDialog.title"), description: t("deleteDialog.description") };

  function handleConfirmDelete() {
    setError(null);
    startTransition(async () => {
      // An installment row deletes that occurrence only — the plan itself is
      // deleted from its own edit page, where the count is on screen.
      const result =
        row.kind === "recurring"
          ? await deleteRecurringTransaction(row.id, locale)
          : await deleteTransaction(row.id, locale);

      if (!result.success) {
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
          <DropdownMenuLinkItem variant="info" render={<Link href={editHref} />}>
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
            <AlertDialogTitle>{dialogCopy.title}</AlertDialogTitle>
            <AlertDialogDescription>{dialogCopy.description}</AlertDialogDescription>
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
