"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";

import type { DateFormat } from "@/generated/prisma/enums";

import { AsyncCombobox } from "@/components/ui/async-combobox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import { toUtcMidnight } from "@/lib/dates";
import type { ComboboxOption } from "@/lib/options";
import { TRANSACTION_TYPES, type TransactionType } from "@/lib/validations/transaction";
import {
  buildTransactionSearchParams,
  countActiveFilters,
  parseTransactionFilters,
  TRANSACTION_SHOW_VALUES,
  type TransactionFilters,
  type TransactionShow,
} from "@/lib/validations/transaction-filters";

export type TransactionFiltersPanelProps = {
  filters: TransactionFilters;
  /** ISO `YYYY-MM-DD`, so the client agrees with the server on "today". */
  today: string;
  dateFormat: DateFormat;
  selectedCategory: ComboboxOption | null;
  selectedCard: ComboboxOption | null;
};

/**
 * `filters.show*` keys are flat (`showAll`, `showSingle`, ...), not a
 * `show.${value}` template, so a typed `t()` call needs an explicit map
 * rather than a dynamically built key.
 */
const SHOW_LABEL_KEYS = {
  all: "filters.showAll",
  single: "filters.showSingle",
  recurring: "filters.showRecurring",
  installments: "filters.showInstallments",
} as const satisfies Record<TransactionShow, string>;

const TYPE_LABEL_KEYS = {
  INCOME: "form.typeIncome",
  EXPENSE: "form.typeExpense",
} as const satisfies Record<TransactionType, string>;

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 disabled:cursor-not-allowed disabled:opacity-50 lg:h-11 lg:text-base";

/**
 * `today` arrives as a string from the server so both sides agree on what the
 * default period is — a client-side `new Date()` could be a day off across a
 * timezone boundary and write out a period that is actually the default.
 */
function hrefFrom(next: TransactionFilters, today: string): string {
  const query = buildTransactionSearchParams(next, toUtcMidnight(today)).toString();
  return query ? `/transactions?${query}` : "/transactions";
}

/**
 * The collapsible filter panel above the transactions list. Holds **draft**
 * state: every control here edits local state only, and nothing outside the
 * panel changes (no navigation, no refetch) until Apply is pressed. Clear
 * resets every control to the default filters and navigates straight to the
 * bare `/transactions`.
 */
export function TransactionFiltersPanel({
  filters,
  today,
  dateFormat,
  selectedCategory,
  selectedCard,
}: TransactionFiltersPanelProps) {
  const t = useTranslations("transactions");
  const router = useRouter();

  const [draft, setDraft] = useState<TransactionFilters>(filters);

  const activeCount = countActiveFilters(filters, toUtcMidnight(today));

  const patchDraft = (patch: Partial<TransactionFilters>) =>
    setDraft((current) => ({ ...current, ...patch }));

  const handleApply = () => {
    router.push(hrefFrom({ ...draft, page: 1 }, today));
  };

  const handleClear = () => {
    const defaults = parseTransactionFilters({}, toUtcMidnight(today));
    setDraft(defaults);
    router.push("/transactions");
  };

  return (
    <Collapsible>
      <CollapsibleTrigger
        render={
          <Button variant="outline">
            {t("filters.title")}
            <ChevronDown
              aria-hidden="true"
              data-icon="inline-end"
              className="transition-transform group-aria-expanded/button:rotate-180"
            />
            {activeCount > 0 && <Badge>{t("filters.active", { count: activeCount })}</Badge>}
          </Button>
        }
      />

      <CollapsibleContent>
        <div className="grid grid-cols-12 gap-4 pt-4">
          <div className="col-span-12 flex flex-col gap-2 lg:col-span-3">
            <Label htmlFor="filter-category">{t("filters.category")}</Label>
            <AsyncCombobox
              id="filter-category"
              endpoint="/api/categories/options"
              value={draft.categoryId}
              onValueChange={(categoryId) => patchDraft({ categoryId })}
              selectedOption={selectedCategory}
              placeholder={t("filters.category")}
              allOptionLabel={t("filters.any")}
            />
          </div>

          <div className="col-span-12 flex flex-col gap-2 lg:col-span-3">
            <Label htmlFor="filter-card">{t("filters.card")}</Label>
            <AsyncCombobox
              id="filter-card"
              endpoint="/api/cards/options"
              value={draft.cardId}
              onValueChange={(cardId) => patchDraft({ cardId })}
              selectedOption={selectedCard}
              placeholder={t("filters.card")}
              allOptionLabel={t("filters.any")}
            />
          </div>

          <div className="col-span-12 flex flex-col gap-2 lg:col-span-3">
            <Label htmlFor="filter-type">{t("filters.type")}</Label>
            <select
              id="filter-type"
              className={selectClassName}
              value={draft.type ?? ""}
              onChange={(event) =>
                patchDraft({
                  type: event.target.value === "" ? null : (event.target.value as TransactionType),
                })
              }
            >
              <option value="">{t("filters.any")}</option>
              {TRANSACTION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(TYPE_LABEL_KEYS[type])}
                </option>
              ))}
            </select>
          </div>

          <div className="col-span-12 flex flex-col gap-2 lg:col-span-3">
            <Label htmlFor="filter-show">{t("filters.show")}</Label>
            <select
              id="filter-show"
              className={selectClassName}
              value={draft.show}
              onChange={(event) => patchDraft({ show: event.target.value as TransactionShow })}
            >
              {TRANSACTION_SHOW_VALUES.map((show) => (
                <option key={show} value={show}>
                  {t(SHOW_LABEL_KEYS[show])}
                </option>
              ))}
            </select>
          </div>

          <div className="col-span-12 flex flex-col gap-2 lg:col-span-3">
            <Label htmlFor="filter-from">{t("filters.from")}</Label>
            <DatePicker
              id="filter-from"
              value={draft.from}
              onValueChange={(from) => patchDraft({ from })}
              dateFormat={dateFormat}
            />
          </div>

          <div className="col-span-12 flex flex-col gap-2 lg:col-span-3">
            <Label htmlFor="filter-to">{t("filters.to")}</Label>
            <DatePicker
              id="filter-to"
              value={draft.to}
              onValueChange={(to) => patchDraft({ to })}
              dateFormat={dateFormat}
            />
          </div>

          <div className="col-span-12 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={handleClear}>
              {t("filters.clear")}
            </Button>
            <Button type="button" onClick={handleApply}>
              {t("filters.apply")}
            </Button>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
