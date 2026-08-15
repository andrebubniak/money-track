"use client";

import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import type { z } from "zod";

import { CircleAlert } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useRouter } from "@/i18n/navigation";
import { createCard, updateCard } from "@/lib/actions/cards";
import { createCardSchema, type CardType, type CardValues } from "@/lib/validations/card";

type CardFormProps = {
  mode: "create" | "edit";
  cardId?: string;
  defaultValues: { name: string; type?: CardType };
};

export function CardForm({ mode, cardId, defaultValues }: CardFormProps) {
  const t = useTranslations("cards.form");
  const tValidation = useTranslations("validation.cards");
  // Passed to the action explicitly: a Server Action cannot resolve the locale
  // itself — see the header comment in `src/lib/actions/cards.ts`.
  const locale = useLocale();
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  // Rebuilt when the translator changes — which is when the locale changes.
  const schema = useMemo(() => createCardSchema(tValidation), [tValidation]);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof schema>, unknown, CardValues>({
    resolver: zodResolver(schema),
    // `type` may start unselected — there is no sensible default between
    // Debit and Credit, unlike the category icon's `layout-grid`. It starts
    // as `""`, not `undefined`: `RadioGroup` is a controlled component, and
    // handing it `value={undefined}` on first render then a real string
    // later makes Base UI warn about switching from uncontrolled to
    // controlled. `""` keeps it controlled from the first render while
    // still failing the schema's `z.enum(["DEBIT", "CREDIT"])` at submit
    // time exactly like `undefined` did — verified directly against zod.
    // This cast only widens the *initial* value TypeScript sees; the
    // schema still requires a real selection at submit time, the same way
    // an empty `name` is allowed here but rejected by `handleSubmit`.
    defaultValues: { ...defaultValues, type: defaultValues.type ?? "" } as z.input<typeof schema>,
  });

  // `useWatch`, not the `watch` function `useForm()` returns — the latter is
  // not memoizable and the React Compiler flags it
  // (react-hooks/incompatible-library). Needed because `RadioGroup` is a
  // controlled component, not a native input `register()` can read back
  // from the DOM.
  const type = useWatch({ control, name: "type" });

  async function onSubmit(values: CardValues) {
    setFormError(null);

    const result =
      mode === "create"
        ? await createCard(values, locale)
        : await updateCard(cardId!, values, locale);

    if (!result.success) {
      // The server already returns a translated, renderable string here —
      // there is no second lookup step. See .claude/rules/validation.md.
      setFormError(result.error);
      return;
    }

    // `replace`, not `push`: the form must not stay in the history stack, or
    // Back returns the user to a form they have finished with.
    router.replace("/dashboard/cards");
    router.refresh();
  }

  return (
    // A 12-column grid, not flex-col — see .claude/rules/ui.md. Name takes
    // most of the row; type gets a smaller fixed portion since two radio
    // options need less room than a text field.
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid grid-cols-12 gap-4">
      {formError && (
        <Alert variant="destructive" className="col-span-12">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <div className="col-span-12 flex flex-col gap-2 lg:col-span-8">
        <Label htmlFor="name" required>
          {t("nameLabel")}
        </Label>
        <Input
          id="name"
          type="text"
          placeholder={t("namePlaceholder")}
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? "name-error" : undefined}
          className="lg:h-11 lg:text-base"
          // register() sets the DOM value imperatively via its ref callback
          // after mount, not through props — see .claude/rules/ui.md.
          defaultValue={defaultValues.name}
          {...register("name")}
        />
        {errors.name && (
          <p id="name-error" className="text-sm text-destructive">
            {errors.name.message}
          </p>
        )}
      </div>

      <div className="col-span-12 flex flex-col gap-2 lg:col-span-4">
        <Label required>{t("typeLabel")}</Label>
        <RadioGroup
          value={type}
          onValueChange={(next) => setValue("type", next as CardType, { shouldValidate: true })}
          aria-invalid={Boolean(errors.type)}
          className="flex flex-1 flex-row items-center gap-4 lg:h-11"
        >
          <label className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="DEBIT" />
            {t("typeDebit")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="CREDIT" />
            {t("typeCredit")}
          </label>
        </RadioGroup>
        {errors.type && <p className="text-sm text-destructive">{errors.type.message}</p>}
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
