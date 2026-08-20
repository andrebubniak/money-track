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
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useRouter } from "@/i18n/navigation";
import { createTransaction, updateTransaction } from "@/lib/actions/transactions";
import type { ComboboxOption } from "@/lib/options";
import {
  createTransactionSchema,
  TRANSACTION_TYPES,
  type TransactionType,
  type TransactionValues,
} from "@/lib/validations/transaction";

type TransactionFormProps = {
  mode: "create" | "edit";
  transactionId?: string;
  defaultValues: TransactionValues;
  /** `YYYY-MM-DD`, computed on the server — see `createTransactionSchema`. */
  today: string;
  dateFormat: DateFormat;
  selectedCategory: ComboboxOption | null;
  selectedCard: ComboboxOption | null;
};

const TYPE_LABEL_KEYS = {
  INCOME: "typeIncome",
  EXPENSE: "typeExpense",
} as const satisfies Record<TransactionType, string>;

export function TransactionForm({
  mode,
  transactionId,
  defaultValues,
  today,
  dateFormat,
  selectedCategory,
  selectedCard,
}: TransactionFormProps) {
  const t = useTranslations("transactions.form");
  const tValidation = useTranslations("validation.transactions");
  // Passed to the action explicitly: a Server Action cannot resolve the
  // locale itself — see `.claude/rules/i18n.md`.
  const locale = useLocale();
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  // Rebuilt when the translator changes — which is when the locale changes.
  const schema = useMemo(
    () => createTransactionSchema(tValidation, { today }),
    [tValidation, today],
  );

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof schema>, unknown, TransactionValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues as z.input<typeof schema>,
  });

  // `useWatch`, not the `watch` function `useForm()` returns — the latter is
  // not memoizable and the React Compiler flags it
  // (react-hooks/incompatible-library). Needed because none of these are
  // native inputs `register()` can read back from the DOM.
  const type = useWatch({ control, name: "type" });
  const date = useWatch({ control, name: "date" });
  const categoryId = useWatch({ control, name: "categoryId" });
  const cardId = useWatch({ control, name: "cardId" });
  const paymentDate = useWatch({ control, name: "paymentDate" });

  // Switching to Income must clear the card, not just hide it: a hidden
  // field still submits its value, and the schema rejects income carrying a
  // card. See `.claude/rules/database.md`'s note on `Transaction.cardId`.
  useEffect(() => {
    if (type === "INCOME") setValue("cardId", null, { shouldValidate: false });
  }, [type, setValue]);

  async function onSubmit(values: TransactionValues) {
    setFormError(null);

    const result =
      mode === "create"
        ? await createTransaction(values, locale)
        : await updateTransaction(transactionId!, values, locale);

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
        <Label htmlFor="date">{t("dateLabel")}</Label>
        <DatePicker
          id="date"
          value={date}
          onValueChange={(next) => setValue("date", next, { shouldValidate: true })}
          dateFormat={dateFormat}
          triggerLabel={t("dateLabel")}
          invalid={Boolean(errors.date)}
        />
        {errors.date && <p className="text-sm text-destructive">{errors.date.message}</p>}
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

      <div className="col-span-12 flex flex-col justify-center gap-2 lg:col-span-3">
        <div className="flex items-center gap-2 lg:h-11">
          <Checkbox
            id="paymentDate"
            checked={paymentDate !== null}
            onCheckedChange={(next) =>
              setValue("paymentDate", next === true ? date : null, { shouldValidate: true })
            }
            aria-invalid={Boolean(errors.paymentDate)}
          />
          <Label htmlFor="paymentDate">{t("paidLabel")}</Label>
        </div>
        {errors.paymentDate && (
          <p className="text-sm text-destructive">{errors.paymentDate.message}</p>
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
