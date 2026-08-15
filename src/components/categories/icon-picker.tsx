"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CATEGORY_ICONS } from "@/lib/category-icons";
import { cn } from "@/lib/utils";

type IconPickerProps = {
  value: string;
  onChange: (icon: string) => void;
};

/**
 * A small round edit-pen trigger that opens a grid of `CATEGORY_ICONS`'s
 * 113 keys to choose from.
 *
 * Deliberately knows nothing about categories, forms, or servers: it takes
 * the current key and reports the next one. The caller (`CategoryForm`) owns
 * everything else — positioning this over the icon preview per the
 * avatar-with-edit-button pattern in `.claude/rules/ui.md`, wiring it into
 * form state, and validating the result against `isCategoryIcon`.
 *
 * No search: the allow-list is fixed and small enough (113 icons) to scan by
 * eye once the grid is large, and a search box was one more control between
 * the user and a 2-second choice. See `.claude/rules/ui.md`.
 */
export function IconPicker({ value, onChange }: IconPickerProps) {
  const t = useTranslations("categories.iconPicker");
  const [open, setOpen] = useState(false);

  function handleSelect(key: string) {
    onChange(key);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <DialogTrigger
              render={
                <Button type="button" variant="secondary" size="icon-sm" className="rounded-full" />
              }
            />
          }
        >
          <Pencil aria-hidden="true" className="size-3.5" />
          <span className="sr-only">{t("title")}</span>
        </TooltipTrigger>
        <TooltipContent>{t("title")}</TooltipContent>
      </Tooltip>

      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>

        <div className="grid max-h-[28rem] grid-cols-6 gap-2 overflow-y-auto sm:grid-cols-8">
          {Object.entries(CATEGORY_ICONS).map(([key, Icon]) => (
            <Button
              key={key}
              type="button"
              variant="ghost"
              size="icon-lg"
              aria-label={key}
              aria-pressed={key === value}
              className={cn(key === value && "bg-muted text-foreground")}
              onClick={() => handleSelect(key)}
            >
              <Icon aria-hidden="true" className="size-6" />
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
