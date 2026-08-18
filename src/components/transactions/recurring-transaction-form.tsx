"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import type { z } from "zod";

import { CircleAlert } from "lucide-react";

import type { DateFormat } from "@/generated/prisma/enums";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { AsyncCombobox } from "@/components/ui/async-combobox";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRouter } from "@/i18n/navigation";
import { createRecurringTransaction, updateRecurringTransaction } from "@/lib/actions/recurring-transactions";
import type { ComboboxOption } from "@/lib/options";
import { RECURRING_FREQUENCIES, type RecurringFrequency } from "@/lib/transactions/occurrences";
import {
  createRecurringTransactionSchema,
  type RecurringTransactionValues,
} from "@/lib/validations/recurring-transaction";
import { TRANSACTION_TYPES, type TransactionType } from "@/lib/validations/transaction";

type RecurringTransactionFormProps = {
  mode: "create" | "edit";
  recurringTransactionId?: string;
  defaultValues: RecurringTransactionValues;
  dateFormat: DateFormat;
  selectedCategory: ComboboxOption | null;
  selectedCard: ComboboxOption | null;
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
 * `TransactionForm`'s grid with two substitutions and one removal: a start
 * date replaces the date, a frequency `Select` replaces the paid checkbox,
 * and there is no `isPaid` field at all — an ongoing recurrence is a
 * definition, not a concrete transaction. See `.claude/rules/ui.md` and
 * `transaction-form.tsx`, which this mirrors field for field.
 */
export function RecurringTransactionForm({
  mode,
  recurringTransactionId,
  defaultValues,
  dateFormat,
  selectedCategory,
  selectedCard,
}: RecurringTransactionFormProps) {
  const t = useTranslations("transactions.form");
  const tFrequency = useTranslations("transactions.frequency");
  const tRecurring = useTranslations("transactions.recurring");
  const tValidation = useTranslations("validation.transactions");
  // Passed to the action explicitly: a Server Action cannot resolve the
  // locale itself — see `.claude/rules/i18n.md`.
  const locale = useLocale();
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  // Rebuilt when the translator changes — which is when the locale changes.
  const schema = useMemo(() => createRecurringTransactionSchema(tValidation), [tValidation]);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof schema>, unknown, RecurringTransactionValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues as z.input<typeof schema>,
  });

  // `useWatch`, not the `watch` function `useForm()` returns — the latter is
  // not memoizable and the React Compiler flags it
  // (react-hooks/incompatible-library). Needed because none of these are
  // native inputs `register()` can read back from the DOM.
  const type = useWatch({ control, name: "type" });
  const startDate = useWatch({ control, name: "startDate" });
  const categoryId = useWatch({ control, name: "categoryId" });
  const cardId = useWatch({ control, name: "cardId" });
  const frequency = useWatch({ control, name: "frequency" });

  // Switching to Income must clear the card, not just hide it: a hidden
  // field still submits its value, and the schema rejects income carrying a
  // card. See `.claude/rules/database.md`'s note on `Transaction.cardId`.
  useEffect(() => {
    if (type === "INCOME") setValue("cardId", null, { shouldValidate: false });
  }, [type, setValue]);

  async function onSubmit(values: RecurringTransactionValues) {
    setFormError(null);

    const result =
      mode === "create"
        ? await createRecurringTransaction(values, locale)
        : await updateRecurringTransaction(recurringTransactionId!, values, locale);

    if (!result.success) {
      // The server already returns a translated, renderable string here —
      // there is no second lookup step. See `.claude/rules/validation.md`.
      setFormError(result.error);
      return;
    }

    // `replace`, not `push`: the form must not stay in the history stack, or
    // Back returns the user to a form they have finished with.
    router.replace("/transactions");
    router.refresh();
  }

  return (
    // A 12-column grid, not flex-col — see `.claude/rules/ui.md`.
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid grid-cols-12 gap-4">
      {formError && (
        <Alert variant="destructive" className="col-span-12">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      {/* Explains why the transaction list stays empty right after saving:
          this only defines the recurrence, it does not generate rows. */}
      <p className="col-span-12 text-sm text-muted-foreground">{tRecurring("note")}</p>

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

      <div className="col-span-12 flex flex-col gap-2 lg:col-span-4">
        <Label htmlFor="amount" required>
          {t("amountLabel")}
        </Label>
        <Input
          id="amount"
          type="number"
          step="0.01"
          placeholder={t("amountPlaceholder")}
          aria-invalid={Boolean(errors.amount)}
          aria-describedby={errors.amount ? "amount-error" : undefined}
          className="lg:h-11 lg:text-base"
          // register() sets the DOM value imperatively via its ref callback
          // after mount, not through props — see `.claude/rules/ui.md`.
          defaultValue={defaultValues.amount}
          {...register("amount")}
        />
        {errors.amount && (
          <p id="amount-error" className="text-sm text-destructive">
            {errors.amount.message}
          </p>
        )}
      </div>

      <div className="col-span-12 flex flex-col gap-2 lg:col-span-4">
        {/* No `required`: `startDate` always carries a pre-filled value —
            today's date on create, the recurrence's own on edit — the same
            reasoning `.claude/rules/ui.md` documents for `CategoryForm`'s
            icon field. */}
        <Label htmlFor="startDate">{t("startDateLabel")}</Label>
        <DatePicker
          id="startDate"
          value={startDate}
          onValueChange={(next) => setValue("startDate", next, { shouldValidate: true })}
          dateFormat={dateFormat}
          triggerLabel={t("startDateLabel")}
          invalid={Boolean(errors.startDate)}
        />
        {errors.startDate && (
          <p className="text-sm text-destructive">{errors.startDate.message}</p>
        )}
      </div>

      <div className="col-span-12 flex flex-col gap-2 lg:col-span-6">
        <Label htmlFor="categoryId" required>
          {t("categoryLabel")}
        </Label>
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
        <div className="col-span-12 flex flex-col gap-2 lg:col-span-6">
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

      <div className="col-span-12 flex flex-col gap-2 lg:col-span-9">
        <Label htmlFor="description">{t("descriptionLabel")}</Label>
        <Input
          id="description"
          type="text"
          placeholder={t("descriptionPlaceholder")}
          aria-invalid={Boolean(errors.description)}
          aria-describedby={errors.description ? "description-error" : undefined}
          className="lg:h-11 lg:text-base"
          defaultValue={defaultValues.description ?? ""}
          {...register("description")}
        />
        {errors.description && (
          <p id="description-error" className="text-sm text-destructive">
            {errors.description.message}
          </p>
        )}
      </div>

      <div className="col-span-12 flex flex-col gap-2 lg:col-span-3">
        {/* No `required`: `frequency` always carries a pre-filled value —
            `MONTHLY` on create, the recurrence's own on edit — same
            reasoning as `startDate` above. */}
        <Label htmlFor="frequency">{t("frequencyLabel")}</Label>
        <Select
          value={frequency}
          onValueChange={(next) => {
            if (next) setValue("frequency", next, { shouldValidate: true });
          }}
        >
          <SelectTrigger
            id="frequency"
            aria-invalid={Boolean(errors.frequency)}
            className="w-full lg:h-11 lg:text-base"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RECURRING_FREQUENCIES.map((value) => (
              <SelectItem key={value} value={value}>
                {tFrequency(FREQUENCY_LABEL_KEYS[value])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.frequency && (
          <p className="text-sm text-destructive">{errors.frequency.message}</p>
        )}
      </div>

      <div className="col-span-12 lg:justify-self-end">
        <Button type="submit" size="lg" className="w-full lg:w-auto" disabled={isSubmitting}>
          {mode === "create"
            ? isSubmitting
              ? t("submitCreating")
              : t("submitCreate")
            : isSubmitting
              ? t("submitSaving")
              : t("submitEdit")}
        </Button>
      </div>
    </form>
  );
}
