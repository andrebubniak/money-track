"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import type { z } from "zod";

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
import { AsyncCombobox } from "@/components/ui/async-combobox";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useRouter } from "@/i18n/navigation";
import { deleteInstallmentPlan, updateInstallmentSeries } from "@/lib/actions/installments";
import { toUtcMidnight } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import type { ComboboxOption } from "@/lib/options";
import type { RecurringFrequency } from "@/lib/transactions/occurrences";
import { createInstallmentSeriesSchema, type InstallmentSeriesValues } from "@/lib/validations/installment";
import { TRANSACTION_TYPES, type TransactionType } from "@/lib/validations/transaction";

type InstallmentSeriesFormProps = {
  planId: string;
  defaultValues: InstallmentSeriesValues;
  selectedCategory: ComboboxOption | null;
  selectedCard: ComboboxOption | null;
  /**
   * The plan's original, frozen total — never incremented or decremented by
   * later per-occurrence edits (`.claude/rules/database.md`'s note on
   * `RecurringTransaction.occurrencesCount`). Shown as read-only text here.
   * Not what the delete dialog interpolates — see `liveOccurrencesCount`.
   */
  occurrencesCount: number;
  /**
   * The plan's *current* live occurrence count — `occurrences.length` on the
   * edit page, i.e. after any individual occurrences already soft-deleted
   * from the list's row actions. `deleteInstallmentPlan` only soft-deletes
   * live rows, so this, not the frozen `occurrencesCount` above, is the
   * number that actually disappears — the delete dialog "names the number of
   * transactions that will disappear" (`docs/superpowers/specs/2026-08-16-transactions-design.md`),
   * and overstates it once any occurrence has been deleted individually if
   * given the frozen total instead.
   */
  liveOccurrencesCount: number;
  frequency: RecurringFrequency;
  /** `YYYY-MM-DD`. Frozen — see the read-only block below. */
  startDate: string;
  dateFormat: DateFormat;
};

const TYPE_LABEL_KEYS = {
  INCOME: "typeIncome",
  EXPENSE: "typeExpense",
} as const satisfies Record<TransactionType, string>;

const FREQUENCY_LABEL_KEYS = {
  DAILY: "DAILY",
  WEEKLY: "WEEKLY",
  BIWEEKLY: "BIWEEKLY",
  MONTHLY: "MONTHLY",
  QUARTERLY: "QUARTERLY",
  SEMIANNUAL: "SEMIANNUAL",
  YEARLY: "YEARLY",
} as const satisfies Record<RecurringFrequency, string>;

/**
 * The series half of the plan edit page: `type`, `category`, and `card` only
 * — the fields that classify the whole series and are written to the
 * definition *and* every live occurrence via `updateInstallmentSeries`.
 * `amount`, `date`, `description`, and `paymentDate` belong to each
 * occurrence instead and are edited row by row in
 * `installment-occurrences-table.tsx`.
 *
 * `frequency`, `startDate`, and the occurrence count are frozen after
 * creation — recomputing dates the user may already have hand-adjusted, or
 * deleting rows they may have marked paid, has no safe answer — so they
 * render as plain read-only text, never form fields. Restructuring means
 * deleting the plan and starting a new one, which is what the "Delete plan"
 * button below is for.
 */
export function InstallmentSeriesForm({
  planId,
  defaultValues,
  selectedCategory,
  selectedCard,
  occurrencesCount,
  liveOccurrencesCount,
  frequency,
  startDate,
  dateFormat,
}: InstallmentSeriesFormProps) {
  const t = useTranslations("transactions.form");
  const tFrequency = useTranslations("transactions.frequency");
  const tInstallments = useTranslations("transactions.installments");
  const tDeleteDialog = useTranslations("transactions.deleteDialog");
  const tValidation = useTranslations("validation.transactions");
  // Passed to the actions explicitly: a Server Action cannot resolve the
  // locale itself — see `.claude/rules/i18n.md`.
  const locale = useLocale();
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Rebuilt when the translator changes — which is when the locale changes.
  const schema = useMemo(() => createInstallmentSeriesSchema(tValidation), [tValidation]);

  const {
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof schema>, unknown, InstallmentSeriesValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues as z.input<typeof schema>,
  });

  // `useWatch`, not the `watch` function `useForm()` returns — the latter is
  // not memoizable and the React Compiler flags it
  // (react-hooks/incompatible-library). Needed because none of these are
  // native inputs a `register()` call could read back from the DOM.
  const type = useWatch({ control, name: "type" });
  const categoryId = useWatch({ control, name: "categoryId" });
  const cardId = useWatch({ control, name: "cardId" });

  // Switching to Income must clear the card, not just hide it: a hidden
  // field still submits its value, and the schema rejects income carrying a
  // card. See `.claude/rules/database.md`'s note on `Transaction.cardId`.
  useEffect(() => {
    if (type === "INCOME") setValue("cardId", null, { shouldValidate: false });
  }, [type, setValue]);

  async function onSubmit(values: InstallmentSeriesValues) {
    setFormError(null);
    setSaved(false);

    const result = await updateInstallmentSeries(planId, values, locale);

    if (!result.success) {
      setFormError(result.error);
      return;
    }

    setSaved(true);
    // Not `router.replace`: unlike a single transaction's or a recurrence's
    // create/edit form, this page also hosts the occurrences table below —
    // leaving would abandon whatever the user is mid-editing there.
    // `refresh()` re-reads the plan server-side so every row's next save
    // carries the category/card/type just chosen, without navigating away.
    router.refresh();
  }

  // Ignores close requests while the delete is in flight, so the dialog
  // cannot be dismissed out from under a pending action (and its error, if
  // the action fails, still has somewhere to render) — mirrors
  // `transaction-row-actions.tsx`.
  function handleDeleteOpenChange(next: boolean) {
    if (isDeleting) return;
    setDeleteOpen(next);
    if (!next) setDeleteError(null);
  }

  async function handleConfirmDelete() {
    setDeleteError(null);
    setIsDeleting(true);

    const result = await deleteInstallmentPlan(planId, locale);

    if (!result.success) {
      setIsDeleting(false);
      setDeleteError(result.error);
      return;
    }

    // The plan itself is gone — nothing left on this page to show.
    router.replace("/transactions");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid grid-cols-12 gap-4">
        {formError && (
          <Alert variant="destructive" className="col-span-12">
            <CircleAlert aria-hidden="true" />
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        {/* Explains why every row below changes together when this saves. */}
        <p className="col-span-12 text-sm text-muted-foreground">{tInstallments("seriesNote")}</p>

        <div className="col-span-12 flex flex-col gap-2 lg:col-span-4">
          <Label id="type-label">{t("typeLabel")}</Label>
          <RadioGroup
            aria-labelledby="type-label"
            value={type}
            onValueChange={(next) => setValue("type", next as TransactionType, { shouldValidate: true })}
            aria-invalid={Boolean(errors.type)}
            className="flex flex-1 flex-row items-center gap-4 lg:h-11"
          >
            {TRANSACTION_TYPES.map((value) => (
              <label key={value} className="flex items-center gap-2 text-sm">
                <RadioGroupItem value={value} aria-invalid={Boolean(errors.type)} />
                {t(TYPE_LABEL_KEYS[value])}
              </label>
            ))}
          </RadioGroup>
          {errors.type && <p className="text-sm text-destructive">{errors.type.message}</p>}
        </div>

        {/* No `required`: unlike the create forms this mirrors, this field
            is never empty for this component — it always carries the
            series' existing category, the same reasoning `.claude/rules/ui.md`
            documents for `CategoryForm`'s icon field. */}
        <div className="col-span-12 flex flex-col gap-2 lg:col-span-4">
          <Label htmlFor="categoryId">{t("categoryLabel")}</Label>
          <AsyncCombobox
            id="categoryId"
            endpoint="/api/categories/options"
            value={categoryId}
            onValueChange={(next) => setValue("categoryId", next ?? "", { shouldValidate: true })}
            selectedOption={selectedCategory}
            placeholder={t("categoryPlaceholder")}
            invalid={Boolean(errors.categoryId)}
          />
          {errors.categoryId && (
            <p className="text-sm text-destructive">{errors.categoryId.message}</p>
          )}
        </div>

        {type === "EXPENSE" && (
          <div className="col-span-12 flex flex-col gap-2 lg:col-span-4">
            <Label htmlFor="cardId">{t("cardLabel")}</Label>
            <AsyncCombobox
              id="cardId"
              endpoint="/api/cards/options"
              value={cardId ?? null}
              onValueChange={(next) => setValue("cardId", next, { shouldValidate: true })}
              selectedOption={selectedCard}
              placeholder={t("cardPlaceholder")}
              invalid={Boolean(errors.cardId)}
            />
            {errors.cardId && <p className="text-sm text-destructive">{errors.cardId.message}</p>}
          </div>
        )}

        <p className="col-span-12 text-sm text-muted-foreground">{tInstallments("frozenNote")}</p>

        <div className="col-span-12 flex flex-col gap-2 lg:col-span-4">
          <Label>{t("frequencyLabel")}</Label>
          <p className="flex h-9 items-center text-sm lg:h-11 lg:text-base">
            {tFrequency(FREQUENCY_LABEL_KEYS[frequency])}
          </p>
        </div>

        <div className="col-span-12 flex flex-col gap-2 lg:col-span-4">
          <Label>{t("startDateLabel")}</Label>
          <p className="flex h-9 items-center text-sm lg:h-11 lg:text-base">
            {formatDate(toUtcMidnight(startDate), dateFormat)}
          </p>
        </div>

        <div className="col-span-12 flex flex-col gap-2 lg:col-span-4">
          <Label>{t("occurrencesLabel")}</Label>
          <p className="flex h-9 items-center text-sm lg:h-11 lg:text-base">{occurrencesCount}</p>
        </div>

        {saved && (
          <p className="col-span-12 text-sm text-success">{tInstallments("occurrenceSaved")}</p>
        )}

        <div className="col-span-12 lg:justify-self-end">
          <Button type="submit" size="lg" className="w-full lg:w-auto" disabled={isSubmitting}>
            {isSubmitting ? t("submitSaving") : t("submitEdit")}
          </Button>
        </div>
      </form>

      <div>
        <Button type="button" variant="destructive" onClick={() => setDeleteOpen(true)}>
          <Trash2 aria-hidden="true" className="size-4" />
          {tInstallments("deletePlan")}
        </Button>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={handleDeleteOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tDeleteDialog("installmentsTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {tDeleteDialog("installmentsDescription", { count: liveOccurrencesCount })}
            </AlertDialogDescription>
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
