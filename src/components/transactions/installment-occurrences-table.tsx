"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CircleAlert, Trash2 } from "lucide-react";

import type { DateFormat } from "@/generated/prisma/enums";

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
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { deleteTransaction, updateTransaction } from "@/lib/actions/transactions";
import type { InstallmentSeriesValues } from "@/lib/validations/installment";
import { createTransactionSchema } from "@/lib/validations/transaction";

export type InstallmentOccurrence = {
  id: string;
  date: string;
  amount: string;
  description: string | null;
  isPaid: boolean;
};

type InstallmentOccurrencesTableProps = {
  planId: string;
  occurrences: InstallmentOccurrence[];
  seriesValues: InstallmentSeriesValues;
  dateFormat: DateFormat;
  /**
   * The occurrence named by `?occurrence=` on the edit page — already
   * validated to be both well-formed and a row of this plan, or `null`. This
   * component re-checks membership against its own `occurrences` prop rather
   * than trusting that validation blindly, since it is also exercised
   * directly in tests without the page in front of it.
   */
  focusOccurrenceId: string | null;
};

/**
 * Only `date` and `isPaid` live in state — both are driven by components
 * with their own controlled value/onChange (`DatePicker`, `Checkbox`), which
 * have no native-input quirks to avoid. `amount` and `description` are plain
 * `<input>`s read through a ref instead, uncontrolled the same way a
 * `register()`-ed field is elsewhere in the app (`.claude/rules/ui.md`) — a
 * *controlled* `type="number"` input fights the browser's own
 * mid-edit handling of a value like "95.00": React re-committing `value`
 * from state after every keystroke can drop the trailing "." or "0" before
 * the digits after it are ever typed. Reading `.value` from the DOM only at
 * Save time sidesteps that entirely.
 */
type RowValues = { date: string; isPaid: boolean };
type RowStatus = "idle" | "saving" | "saved";

/**
 * One row per occurrence, each its own small form. `amount`, `date`,
 * `description`, and `isPaid` are the only fields that vary row to row — the
 * series' category, card, and type ride along unchanged on every save, so a
 * per-row edit can never reclassify the row. `installment-series-form.tsx`
 * owns those three fields instead; see `.claude/rules/database.md`'s note on
 * why `type` has to be a series-level field.
 *
 * Pending/saved/error state is tracked per occurrence id, in a `Record`, not
 * as one flag for the whole table — saving one row must not blank another
 * row's feedback.
 */
export function InstallmentOccurrencesTable({
  planId,
  occurrences,
  seriesValues,
  dateFormat,
  focusOccurrenceId,
}: InstallmentOccurrencesTableProps) {
  const t = useTranslations("transactions.table");
  const tInstallments = useTranslations("transactions.installments");
  const tDeleteDialog = useTranslations("transactions.deleteDialog");
  const tValidation = useTranslations("validation.transactions");
  // Passed to the actions explicitly: a Server Action cannot resolve the
  // locale itself — see `.claude/rules/i18n.md`.
  const locale = useLocale();

  // Rebuilt when the translator changes — which is when the locale changes.
  // The same schema `updateTransaction` validates with server-side, so a row
  // can never disagree with the server about what a valid occurrence is.
  const schema = useMemo(() => createTransactionSchema(tValidation), [tValidation]);

  const [values, setValues] = useState<Record<string, RowValues>>(() =>
    Object.fromEntries(
      occurrences.map((occurrence) => [occurrence.id, { date: occurrence.date, isPaid: occurrence.isPaid }]),
    ),
  );
  const [status, setStatus] = useState<Record<string, RowStatus>>({});
  const [rowError, setRowError] = useState<Record<string, string | null>>({});
  // Deleted occurrences are hidden locally rather than removed from the
  // `occurrences` prop, which this component does not own.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const amountRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const descriptionRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  // Scrolls to and focuses the occurrence named by the query param, once.
  // Guards membership itself rather than trusting the page's own validation
  // — see the prop's own comment.
  useEffect(() => {
    if (!focusOccurrenceId) return;
    if (!occurrences.some((occurrence) => occurrence.id === focusOccurrenceId)) return;

    // jsdom does not implement `scrollIntoView`; optional-chaining the method
    // itself (not just the element) keeps this safe under test.
    rowRefs.current[focusOccurrenceId]?.scrollIntoView?.({ block: "center" });
    amountRefs.current[focusOccurrenceId]?.focus();
    // `occurrences` deliberately left out: this only ever needs to run for
    // the id the page named, not on every re-render the prop's own identity
    // happens to change on (e.g. after a series save's `router.refresh()`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusOccurrenceId]);

  function clearRowFeedback(id: string) {
    setStatus((current) => ({ ...current, [id]: "idle" }));
    setRowError((current) => ({ ...current, [id]: null }));
  }

  function updateRow(id: string, patch: Partial<RowValues>) {
    setValues((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
    clearRowFeedback(id);
  }

  async function handleSave(occurrence: InstallmentOccurrence) {
    const row = values[occurrence.id];
    const amount = amountRefs.current[occurrence.id]?.value ?? "";
    const description = descriptionRefs.current[occurrence.id]?.value ?? "";
    const parsed = schema.safeParse({ ...seriesValues, ...row, amount, description });

    if (!parsed.success) {
      setRowError((current) => ({
        ...current,
        [occurrence.id]: parsed.error.issues[0]?.message ?? null,
      }));
      return;
    }

    setStatus((current) => ({ ...current, [occurrence.id]: "saving" }));
    setRowError((current) => ({ ...current, [occurrence.id]: null }));

    const result = await updateTransaction(occurrence.id, parsed.data, locale);

    if (!result.success) {
      setStatus((current) => ({ ...current, [occurrence.id]: "idle" }));
      setRowError((current) => ({ ...current, [occurrence.id]: result.error }));
      return;
    }

    setStatus((current) => ({ ...current, [occurrence.id]: "saved" }));
  }

  // Ignores close requests while the delete is in flight, so the dialog
  // cannot be dismissed out from under a pending action — mirrors
  // `transaction-row-actions.tsx`.
  function handleDeleteOpenChange(next: boolean) {
    if (isDeleting) return;
    if (!next) {
      setDeleteTargetId(null);
      setDeleteError(null);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTargetId) return;

    setDeleteError(null);
    setIsDeleting(true);

    const result = await deleteTransaction(deleteTargetId, locale);

    setIsDeleting(false);

    if (!result.success) {
      setDeleteError(result.error);
      return;
    }

    setHiddenIds((current) => new Set(current).add(deleteTargetId));
    setDeleteTargetId(null);
  }

  const visibleOccurrences = occurrences.filter((occurrence) => !hiddenIds.has(occurrence.id));

  return (
    <div data-plan-id={planId} className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <span className="sr-only">{tInstallments("occurrencesTitle")}</span>
            </TableHead>
            <TableHead>{t("date")}</TableHead>
            <TableHead>{t("amount")}</TableHead>
            <TableHead>{t("description")}</TableHead>
            <TableHead>{t("paid")}</TableHead>
            <TableHead className="text-right">{t("actions")}</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {visibleOccurrences.map((occurrence, index) => {
            const row = values[occurrence.id];
            const rowStatus = status[occurrence.id] ?? "idle";
            const error = rowError[occurrence.id];

            return (
              <TableRow
                key={occurrence.id}
                ref={(element) => {
                  rowRefs.current[occurrence.id] = element;
                }}
              >
                <TableCell className="text-muted-foreground">
                  {t("series", { index: index + 1, total: visibleOccurrences.length })}
                </TableCell>

                <TableCell>
                  <DatePicker
                    value={row.date}
                    onValueChange={(next) => updateRow(occurrence.id, { date: next })}
                    dateFormat={dateFormat}
                    // One picker per row: its own `aria-label` always wins
                    // over an external `<Label htmlFor>`, so every row needs
                    // a distinct name or a screen reader announces every
                    // picker on the page identically. See
                    // `.claude/rules/ui.md` and `date-picker.tsx`.
                    triggerLabel={tInstallments("occurrenceDateLabel", { index: index + 1 })}
                  />
                </TableCell>

                <TableCell>
                  <Input
                    type="number"
                    step="0.01"
                    defaultValue={occurrence.amount}
                    onChange={() => clearRowFeedback(occurrence.id)}
                    aria-label={tInstallments("occurrenceAmountLabel", { index: index + 1 })}
                    className="w-28"
                    ref={(element) => {
                      amountRefs.current[occurrence.id] = element;
                    }}
                  />
                </TableCell>

                <TableCell>
                  <Input
                    type="text"
                    defaultValue={occurrence.description ?? ""}
                    onChange={() => clearRowFeedback(occurrence.id)}
                    aria-label={tInstallments("occurrenceDescriptionLabel", { index: index + 1 })}
                    ref={(element) => {
                      descriptionRefs.current[occurrence.id] = element;
                    }}
                  />
                </TableCell>

                <TableCell>
                  <Checkbox
                    checked={row.isPaid}
                    onCheckedChange={(next) => updateRow(occurrence.id, { isPaid: next === true })}
                    aria-label={tInstallments("occurrencePaidLabel", { index: index + 1 })}
                  />
                </TableCell>

                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    {rowStatus === "saved" && (
                      <span className="text-sm text-success">{tInstallments("occurrenceSaved")}</span>
                    )}

                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleSave(occurrence)}
                      disabled={rowStatus === "saving"}
                    >
                      {rowStatus === "saving"
                        ? tInstallments("occurrenceSaving")
                        : tInstallments("occurrenceSave")}
                    </Button>

                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            type="button"
                            variant="destructive"
                            size="icon-sm"
                            aria-label={tInstallments("occurrenceDelete")}
                            onClick={() => setDeleteTargetId(occurrence.id)}
                          />
                        }
                      >
                        <Trash2 aria-hidden="true" className="size-4" />
                      </TooltipTrigger>
                      <TooltipContent>{tInstallments("occurrenceDelete")}</TooltipContent>
                    </Tooltip>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* One dialog, shared across every row's delete button — which
          occurrence it targets lives in `deleteTargetId`, not in a per-row
          instance. Fully controlled rather than an `AlertDialogTrigger`
          nested in a row, for the same reason `transaction-row-actions.tsx`
          is: nothing here unmounts the trigger before the dialog opens, but
          keeping the same shape avoids the trap either way. */}
      <AlertDialog open={deleteTargetId !== null} onOpenChange={handleDeleteOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tDeleteDialog("title")}</AlertDialogTitle>
            <AlertDialogDescription>{tDeleteDialog("description")}</AlertDialogDescription>
          </AlertDialogHeader>

          {deleteError && (
            <Alert variant="destructive">
              <CircleAlert aria-hidden="true" />
              <AlertDescription>{deleteError}</AlertDescription>
            </Alert>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{tDeleteDialog("cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleConfirmDelete} disabled={isDeleting}>
              {isDeleting ? tDeleteDialog("confirming") : tDeleteDialog("confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
