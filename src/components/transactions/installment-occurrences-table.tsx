"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { BadgeCheck, CircleAlert, Trash2 } from "lucide-react";

import type { DateFormat, NumberFormat } from "@/generated/prisma/enums";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MoneyInput } from "@/components/ui/money-input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { deleteTransaction, updateTransaction } from "@/lib/actions/transactions";
import { toUtcMidnight } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import type { InstallmentSeriesValues } from "@/lib/validations/installment";
import {
  createTransactionSchema,
  MAX_TRANSACTION_DATE,
} from "@/lib/validations/transaction";

export type InstallmentOccurrence = {
  id: string;
  /**
   * The 1-based position this row was created with — the same stable
   * numbering the transactions list shows (`fetchOccurrenceIndexes`,
   * computed over every generated row, live or soft-deleted, before this
   * component ever filters to what's currently visible). Not derived from
   * this table's own row order: doing that here would renumber a row
   * whenever an earlier sibling is deleted, disagreeing with the list.
   */
  index: number;
  date: string;
  amount: string;
  /** `YYYY-MM-DD` when paid, null when not. */
  paymentDate: string | null;
};

type InstallmentOccurrencesTableProps = {
  planId: string;
  occurrences: InstallmentOccurrence[];
  /**
   * The plan's original, frozen total (`RecurringTransaction.occurrencesCount`)
   * — the same `N` the list's `n/N` numbering uses, and never the count of
   * currently-visible rows. `installment-series-form.tsx`'s read-only
   * "Occurrences" field shows the same number for the same reason.
   */
  occurrencesCount: number;
  seriesValues: InstallmentSeriesValues;
  /** `YYYY-MM-DD`, computed on the server — see `createTransactionSchema`. */
  today: string;
  dateFormat: DateFormat;
  /** The user's stored separator convention, never the UI language's. */
  numberFormat: NumberFormat;
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
 * Every editable field of a row lives in state, and every input reading one
 * is controlled: `DatePicker` has its own value/onChange, `amount` is a
 * `MoneyInput`, and `paymentDate` is written by the mark-as-paid dialog
 * below.
 *
 * `amount` used to be a plain, uncontrolled `type="number"` input read
 * through a ref at Save time, because a *controlled* one fights the
 * browser's own mid-edit handling of a value like "95.00": React
 * re-committing `value` from state after every keystroke can drop the
 * trailing "." or "0" before the digits after it are ever typed.
 * `MoneyInput` derives its display from a digit string, so there is no
 * free-form "." or trailing "0" left to lose and that reason no longer
 * applies.
 *
 * With nothing uncontrolled left in a row, the render-time state adjustment
 * below is the *only* place a changed `occurrences` prop is reconciled with
 * what is on screen — the ref-based `useEffect` that used to push `amount`
 * and `description` into their DOM nodes went with them.
 */
type RowValues = { date: string; amount: string; paymentDate: string | null };
type RowStatus = "idle" | "saving" | "saved";

/** Field-by-field equality for one occurrence's server data. */
function occurrenceDataEqual(a: InstallmentOccurrence, b: InstallmentOccurrence): boolean {
  return a.date === b.date && a.amount === b.amount && a.paymentDate === b.paymentDate;
}

function toServerSnapshot(occurrences: InstallmentOccurrence[]): Record<string, InstallmentOccurrence> {
  return Object.fromEntries(occurrences.map((occurrence) => [occurrence.id, occurrence]));
}

/**
 * The latest day a payment may be dated: the *earlier* of today and the
 * occurrence's own date. A payment cannot postdate the occurrence it
 * settles, and `createTransactionSchema` caps `paymentDate` at today
 * regardless of how far into the future `date` itself is allowed to run.
 *
 * That second half is the whole reason this exists. A plan's occurrences
 * are generated months ahead, so the old checkbox — which marked a row paid
 * by copying the row's own `date` into `paymentDate` — produced a
 * future-dated payment on every unpaid row of a fresh plan (11 of 12 in a
 * yearly one) and failed `paymentDate.notInFuture` before the save ever
 * left the browser. Taking the earlier of the two is always satisfiable.
 *
 * The cap belongs here, on `paymentDate`, and *never* on `date`: a
 * future-dated occurrence is exactly what a plan is made of, and the row's
 * own schema deliberately widens `date`'s ceiling to `MAX_TRANSACTION_DATE`
 * for that reason (see `schema` below, and `transactions.spec.ts`).
 */
function paymentDateCeiling(occurrenceDate: string, today: string): string {
  return occurrenceDate < today ? occurrenceDate : today;
}

/**
 * Derived from the current draft values on every render, never stored: a
 * row is invalid when its date falls before the previous visible row's, or
 * when its payment date is later than its own date. Anchoring on the
 * immediately previous row — not the greatest date seen so far — is what
 * makes this agree exactly with the rule `updateTransaction` enforces, so
 * `[Mar, Jan, Feb]` flags only the Jan row.
 *
 * Both comparisons are plain string `<`/`>` on `YYYY-MM-DD`, which is a
 * correct date comparison for that shape.
 */
function invalidRowIds(
  rows: { id: string; date: string; paymentDate: string | null }[],
): Set<string> {
  const invalid = new Set<string>();
  let previous: string | null = null;

  for (const row of rows) {
    if (previous !== null && row.date < previous) invalid.add(row.id);
    if (row.paymentDate && row.paymentDate > row.date) invalid.add(row.id);
    previous = row.date;
  }

  return invalid;
}

/**
 * One row per occurrence, each its own small form. `amount`, `date`, and
 * `paymentDate` are the only fields that vary row to row — the series'
 * category, card, type, and description ride along unchanged on every save,
 * so a per-row edit can never reclassify the row.
 * `installment-series-form.tsx` owns those four fields instead; see
 * `.claude/rules/database.md`'s note on why `type` has to be a series-level
 * field.
 *
 * Pending/saved/error state is tracked per occurrence id, in a `Record`, not
 * as one flag for the whole table — saving one row must not blank another
 * row's feedback.
 */
export function InstallmentOccurrencesTable({
  planId,
  occurrences,
  occurrencesCount,
  seriesValues,
  today,
  dateFormat,
  numberFormat,
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
  // `maxDate: MAX_TRANSACTION_DATE` widens the ceiling back: a plan's
  // occurrences are generated into the future by design, so capping them at
  // today would make every one of them unsavable. `updateTransaction` picks
  // the same ceiling from the row itself.
  const schema = useMemo(
    () => createTransactionSchema(tValidation, { today, maxDate: MAX_TRANSACTION_DATE }),
    [tValidation, today],
  );

  const [values, setValues] = useState<Record<string, RowValues>>(() =>
    Object.fromEntries(
      occurrences.map((occurrence) => [
        occurrence.id,
        {
          date: occurrence.date,
          amount: occurrence.amount,
          paymentDate: occurrence.paymentDate,
        },
      ]),
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

  // Which row the one shared mark-as-paid dialog is currently editing, and
  // the day it has staged — the same "id, not an instance per row" shape
  // `deleteTargetId` uses below.
  const [paidTargetId, setPaidTargetId] = useState<string | null>(null);
  const [paidDraft, setPaidDraft] = useState("");

  // Focus only — never a source of a row's value, which `values` owns. The
  // `focusOccurrenceId` effect below is the single reader.
  const amountRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  // The last server data this component has rendered per occurrence id,
  // seeded to match the very first `occurrences` prop so there is nothing
  // to resync on mount.
  const [lastServerValues, setLastServerValues] = useState(() => toServerSnapshot(occurrences));

  // This table stays mounted across a `router.refresh()` — the series form
  // triggers one on save without navigating away — so a later `occurrences`
  // prop can describe a row already on screen differently than what it's
  // currently showing (another tab saved that same occurrence in the
  // meantime, for instance). Without this, a row's stale display survives
  // the refresh, and clicking Save on it silently overwrites the newer
  // server value with the stale one — real, silent data loss in a finance
  // app.
  //
  // That fix happens here, *during render*, rather than in a `useEffect` —
  // this is React's own documented "adjusting state when a prop changes"
  // pattern (react.dev/learn/you-might-not-need-an-effect), not the anti-pattern
  // `react-hooks/set-state-in-effect` exists to catch (which is why the rule
  // fired here when this lived in an effect: calling a state setter
  // unconditionally inside an effect body). Calling `setState` here is safe
  // and does not loop, because `changedIds` is empty — and so this whole
  // block is skipped — on the very next render, once `lastServerValues`
  // has caught up. It also means a changed row is corrected *before* a
  // stale frame is ever committed, rather than flashing stale and then
  // fixing itself the way an effect-based version would.
  //
  // Resyncing only the ids whose server data actually changed (not every
  // row on every render) is what keeps an in-progress edit on an
  // *unrelated*, unchanged row from being wiped by this same check. The
  // trade-off: a row the user is *actively, unsaved-ly* editing right now,
  // whose server value changes underneath it at that exact moment, loses
  // that local edit too — there is no way to both show the new server truth
  // and keep an edit that disagrees with it, and silently keeping the stale
  // local input instead would be the actual bug this exists to fix.
  const changedIds = occurrences
    .filter((occurrence) => {
      const before = lastServerValues[occurrence.id];
      return !before || !occurrenceDataEqual(before, occurrence);
    })
    .map((occurrence) => occurrence.id);

  if (changedIds.length > 0) {
    const changed = new Set(changedIds);

    setLastServerValues(toServerSnapshot(occurrences));
    setValues((current) => {
      const next = { ...current };
      for (const occurrence of occurrences) {
        if (changed.has(occurrence.id)) {
          next[occurrence.id] = {
            date: occurrence.date,
            amount: occurrence.amount,
            paymentDate: occurrence.paymentDate,
          };
        }
      }
      return next;
    });
    setStatus((current) => {
      const next = { ...current };
      for (const id of changedIds) next[id] = "idle";
      return next;
    });
    setRowError((current) => {
      const next = { ...current };
      for (const id of changedIds) next[id] = null;
      return next;
    });
  }

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

  // Seeding the draft here rather than in an effect keeps the dialog's
  // first frame correct: `paidTargetId` and `paidDraft` are set in the same
  // event, so the picker never renders a stale day.
  //
  // An already-paid row opens on the day it was actually paid, not on the
  // ceiling. A row paid on the 2nd but dated the 5th would otherwise reopen
  // showing the 5th, and confirming would silently rewrite the stored day
  // to a date the user never chose — a dialog must show the value it is
  // about to replace. The seed is the earlier of the two — `YYYY-MM-DD`
  // sorts lexicographically, so `<` is a correct date comparison here — so
  // a stored value that somehow sits above the ceiling still cannot be
  // re-confirmed as-is; an unpaid row has nothing stored and falls back to
  // the ceiling.
  function openPaidDialog(occurrence: InstallmentOccurrence) {
    const row = values[occurrence.id] ?? occurrence;
    const ceiling = paymentDateCeiling(row.date, today);

    setPaidDraft(row.paymentDate && row.paymentDate < ceiling ? row.paymentDate : ceiling);
    setPaidTargetId(occurrence.id);
  }

  // Draft state only — the row's own Save is still what persists it, exactly
  // as this table's date and amount fields behave. Calling
  // `updateTransaction` from here would make one field of a row save on a
  // different gesture than the rest of it.
  function commitPaid(paymentDate: string | null) {
    if (!paidTargetId) return;
    updateRow(paidTargetId, { paymentDate });
    setPaidTargetId(null);
  }

  async function handleSave(occurrence: InstallmentOccurrence) {
    const row = values[occurrence.id];
    // `row`, never `amountRefs.current[...].value`: the field is controlled,
    // so state is the value, and reading the DOM back would only reintroduce
    // a second source of truth.
    const parsed = schema.safeParse({ ...seriesValues, ...row });

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

  // Resolved against the *visible* rows, so a row deleted while its dialog
  // is open closes the dialog rather than leaving it editing a row that is
  // no longer on screen.
  const paidTarget = visibleOccurrences.find((occurrence) => occurrence.id === paidTargetId) ?? null;
  const paidTargetRow = paidTarget ? (values[paidTarget.id] ?? paidTarget) : null;

  // Over the *visible* rows in `occurrence.index` order: a locally deleted
  // occurrence is hidden rather than removed from the prop, and must not go
  // on anchoring the row below it.
  const invalidIds = invalidRowIds(
    visibleOccurrences.map((occurrence) => ({
      id: occurrence.id,
      ...(values[occurrence.id] ?? {
        date: occurrence.date,
        paymentDate: occurrence.paymentDate,
      }),
    })),
  );

  return (
    <div data-plan-id={planId} className="rounded-md border">
      {invalidIds.size > 0 && (
        <Alert variant="destructive" className="m-4 mb-0">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{tInstallments("datesOutOfOrder")}</AlertDescription>
        </Alert>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <span className="sr-only">{tInstallments("occurrencesTitle")}</span>
            </TableHead>
            <TableHead>{t("date")}</TableHead>
            <TableHead>{t("amount")}</TableHead>
            <TableHead>{t("paymentDate")}</TableHead>
            <TableHead className="text-right">{t("actions")}</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {visibleOccurrences.map((occurrence) => {
            // Falls back to the occurrence's own server values for an id
            // `values` has never seen — defensive only: the render-time
            // adjustment above already seeds/resyncs `values` for every id
            // in `occurrences` before this ever runs.
            const row = values[occurrence.id] ?? {
              date: occurrence.date,
              amount: occurrence.amount,
              paymentDate: occurrence.paymentDate,
            };
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
                  {t("series", { index: occurrence.index, total: occurrencesCount })}
                </TableCell>

                <TableCell>
                  <DatePicker
                    value={row.date}
                    onValueChange={(next) => updateRow(occurrence.id, { date: next })}
                    dateFormat={dateFormat}
                    invalid={invalidIds.has(occurrence.id)}
                    // One picker per row: its own `aria-label` always wins
                    // over an external `<Label htmlFor>`, so every row needs
                    // a distinct name or a screen reader announces every
                    // picker on the page identically. See
                    // `.claude/rules/ui.md` and `date-picker.tsx`.
                    triggerLabel={tInstallments("occurrenceDateLabel", { index: occurrence.index })}
                  />
                </TableCell>

                <TableCell>
                  <MoneyInput
                    value={row.amount}
                    onValueChange={(next) => updateRow(occurrence.id, { amount: next })}
                    numberFormat={numberFormat}
                    // One field per row, so each needs a distinct accessible
                    // name — the same reasoning as the date picker above.
                    aria-label={tInstallments("occurrenceAmountLabel", { index: occurrence.index })}
                    className="w-36"
                    ref={(element) => {
                      amountRefs.current[occurrence.id] = element;
                    }}
                  />
                </TableCell>

                <TableCell className="text-muted-foreground">
                  {row.paymentDate ? (
                    formatDate(toUtcMidnight(row.paymentDate), dateFormat)
                  ) : (
                    <Badge variant="secondary">{t("notPaid")}</Badge>
                  )}
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
                      // Every Save disables, not just the offending row's: a
                      // per-row block would let a user commit half a reshuffle
                      // and navigate away with the series still out of order.
                      disabled={rowStatus === "saving" || invalidIds.size > 0}
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
                            variant="info"
                            size="icon-sm"
                            // The tooltip shows the un-indexed label, read in
                            // the context of its own row; the accessible name
                            // carries the index, because a screen reader user
                            // tabbing the table has no such context. One
                            // interpolated message, never a name assembled in
                            // code — see `.claude/rules/i18n.md`.
                            aria-label={tInstallments("occurrenceMarkPaidLabel", {
                              index: occurrence.index,
                            })}
                            onClick={() => openPaidDialog(occurrence)}
                          />
                        }
                      >
                        <BadgeCheck aria-hidden="true" className="size-4" />
                      </TooltipTrigger>
                      <TooltipContent>{tInstallments("markPaid")}</TooltipContent>
                    </Tooltip>

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

      {/* One dialog for every row's mark-as-paid button, the same way the
          delete dialog above is shared — which occurrence it targets lives
          in `paidTargetId`, not in a per-row instance.

          It writes to the row's draft state only; the row's own Save is
          what sends it to the server. */}
      <Dialog
        open={paidTarget !== null}
        onOpenChange={(next) => {
          if (!next) setPaidTargetId(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{tInstallments("markPaidTitle")}</DialogTitle>
          </DialogHeader>

          {paidTarget && paidTargetRow && (
            <DatePicker
              value={paidDraft}
              onValueChange={setPaidDraft}
              dateFormat={dateFormat}
              // Capped at the earlier of today and this occurrence's own
              // date — see `paymentDateCeiling`. This is the fix for a
              // future-dated occurrence being unmarkable at all.
              maxDate={paymentDateCeiling(paidTargetRow.date, today)}
              triggerLabel={tInstallments("occurrencePaymentDateLabel", {
                index: paidTarget.index,
              })}
            />
          )}

          <DialogFooter>
            {paidTargetRow?.paymentDate != null && (
              <Button type="button" variant="secondary" onClick={() => commitPaid(null)}>
                {tInstallments("markPaidClear")}
              </Button>
            )}
            <Button type="button" onClick={() => commitPaid(paidDraft)}>
              {tInstallments("markPaidConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
