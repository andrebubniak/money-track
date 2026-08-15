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
import { IconPicker } from "@/components/categories/icon-picker";
import { useRouter } from "@/i18n/navigation";
import { createCategory, updateCategory } from "@/lib/actions/categories";
import { CATEGORY_ICONS, DEFAULT_CATEGORY_ICON, isCategoryIcon } from "@/lib/category-icons";
import { createCategorySchema, type CategoryValues } from "@/lib/validations/category";

type CategoryFormProps = {
  mode: "create" | "edit";
  categoryId?: string;
  defaultValues: CategoryValues;
};

export function CategoryForm({ mode, categoryId, defaultValues }: CategoryFormProps) {
  const t = useTranslations("categories.form");
  const tValidation = useTranslations("validation.categories");
  // Passed to the action explicitly: a Server Action cannot resolve the locale
  // itself — see the header comment in `src/lib/actions/categories.ts`.
  const locale = useLocale();
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  // Rebuilt when the translator changes — which is when the locale changes.
  const schema = useMemo(() => createCategorySchema(tValidation), [tValidation]);

  // `icon`'s output type is narrowed to a `keyof typeof CATEGORY_ICONS` union
  // by the schema's `.refine(isCategoryIcon, …)` — that is `CategoryValues`,
  // the type `onSubmit` receives. But the *raw* field the form holds before
  // validation is a plain string (from `IconPicker`'s `onChange`, or an
  // invalid persisted value), so the form itself is typed on the schema's
  // wider input shape, with `CategoryValues` supplied only as the
  // post-validation transformed type.
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof schema>, unknown, CategoryValues>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  // `useWatch`, not the `watch` function `useForm()` returns — the latter is
  // not memoizable and the React Compiler flags it (react-hooks/incompatible-library).
  const icon = useWatch({ control, name: "icon" });
  const SelectedIcon = CATEGORY_ICONS[isCategoryIcon(icon) ? icon : DEFAULT_CATEGORY_ICON];

  async function onSubmit(values: CategoryValues) {
    setFormError(null);

    const result =
      mode === "create"
        ? await createCategory(values, locale)
        : await updateCategory(categoryId!, values, locale);

    if (!result.success) {
      // The server already returns a translated, renderable string here —
      // unlike authErrorMessage's error codes, there is no second lookup
      // step. See .claude/rules/validation.md.
      setFormError(result.error);
      return;
    }

    // `replace`, not `push`: the form must not stay in the history stack, or
    // Back returns the user to a form they have finished with.
    router.replace("/dashboard/categories");
    router.refresh();
  }

  return (
    // A 12-column grid, not flex-col: every field spans the full row
    // (`col-span-12`) until `lg:`, where each gets only the columns its
    // content needs — name and description split the row evenly, icon gets
    // a small fixed portion at the end. A field that doesn't fit the
    // remaining columns of a row wraps to the next one automatically. See
    // `.claude/rules/ui.md`.
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid grid-cols-12 gap-4">
      {formError && (
        <Alert variant="destructive" className="col-span-12">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <div className="col-span-12 flex flex-col gap-2 lg:col-span-5">
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
          // `register()` never puts a value/defaultValue in its returned
          // props — it sets the DOM value imperatively via its `ref`
          // callback after mount. Without this, SSR renders a genuinely
          // empty input, and on a slow connection the user sees that empty
          // input for as long as hydration takes before it fills in. See
          // `.claude/rules/ui.md`.
          defaultValue={defaultValues.name}
          {...register("name")}
        />
        {errors.name && <p id="name-error" className="text-sm text-destructive">{errors.name.message}</p>}
      </div>

      <div className="col-span-12 flex flex-col gap-2 lg:col-span-5">
        <Label htmlFor="description">{t("descriptionLabel")}</Label>
        <Input
          id="description"
          type="text"
          placeholder={t("descriptionPlaceholder")}
          aria-invalid={Boolean(errors.description)}
          aria-describedby={errors.description ? "description-error" : undefined}
          className="lg:h-11 lg:text-base"
          // See the `name` field's comment above.
          defaultValue={defaultValues.description}
          {...register("description")}
        />
        {errors.description && (
          <p id="description-error" className="text-sm text-destructive">{errors.description.message}</p>
        )}
      </div>

      {/* A preset value (`DEFAULT_CATEGORY_ICON`) from the moment the form
          mounts, so it never needs the required-field asterisk — see
          `.claude/rules/ui.md`. */}
      <div className="col-span-12 flex flex-col gap-2 lg:col-span-2">
        <Label>{t("iconLabel")}</Label>
        {/* Avatar-with-edit-button pattern: a round preview of the current
            icon, with the picker's small round trigger overlaid at the
            bottom-right corner — see `.claude/rules/ui.md`. */}
        <div className="relative inline-flex size-16 items-center justify-center rounded-full bg-muted">
          <SelectedIcon aria-hidden="true" className="size-6 text-muted-foreground" />
          <div className="absolute -right-1 -bottom-1">
            <IconPicker value={icon} onChange={(next) => setValue("icon", next, { shouldValidate: true })} />
          </div>
        </div>
        {errors.icon && <p className="text-sm text-destructive">{errors.icon.message}</p>}
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
