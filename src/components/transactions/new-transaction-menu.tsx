"use client";

import { CalendarSync, Plus, Receipt, Layers } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLinkItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "@/i18n/navigation";

/**
 * Three kinds behind one control, the same way row actions collapse several
 * actions behind an ellipsis rather than lining up buttons
 * (`.claude/rules/ui.md`). Each item carries a one-line hint because
 * "Recurring" and "Installments" are not self-explanatory the first time.
 */
export type NewTransactionMenuProps = {
  /**
   * `"link"` is the transactions list's empty state, where the control has
   * to read as the inline text link it replaces rather than as a second
   * primary button under the one already in the page header.
   */
  variant?: "button" | "link";
  label?: string;
};

export function NewTransactionMenu({ variant = "button", label }: NewTransactionMenuProps) {
  const t = useTranslations("transactions.actions");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          variant === "link" ? (
            <Button
              variant="link"
              className="h-auto p-0 text-sm font-medium underline underline-offset-4"
            />
          ) : (
            <Button />
          )
        }
      >
        {variant === "button" && <Plus data-icon="inline-start" aria-hidden="true" />}
        {label ?? t("new")}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-64 max-w-sm">
        <DropdownMenuLinkItem render={<Link href="/transactions/new" />}>
          <Receipt aria-hidden="true" className="size-6" />
          <span className="flex flex-col">
            <span>{t("newSingle")}</span>
            <span className="text-xs text-muted-foreground">{t("newSingleHint")}</span>
          </span>
        </DropdownMenuLinkItem>

        <DropdownMenuLinkItem render={<Link href="/transactions/recurring/new" />}>
          <CalendarSync aria-hidden="true" className="size-6" />
          <span className="flex flex-col">
            <span>{t("newRecurring")}</span>
            <span className="text-xs text-muted-foreground">{t("newRecurringHint")}</span>
          </span>
        </DropdownMenuLinkItem>

        <DropdownMenuLinkItem render={<Link href="/transactions/installments/new" />}>
          <Layers aria-hidden="true" className="size-6" />
          <span className="flex flex-col">
            <span>{t("newInstallments")}</span>
            <span className="text-xs text-muted-foreground">{t("newInstallmentsHint")}</span>
          </span>
        </DropdownMenuLinkItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
