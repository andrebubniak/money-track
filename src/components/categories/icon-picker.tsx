"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CATEGORY_ICONS, DEFAULT_CATEGORY_ICON, isCategoryIcon } from "@/lib/category-icons";
import { cn } from "@/lib/utils";

type IconPickerProps = {
  value: string;
  onChange: (icon: string) => void;
};

/**
 * A controlled search+grid modal for choosing one of `CATEGORY_ICONS`'s keys.
 *
 * Deliberately knows nothing about categories, forms, or servers: it takes
 * the current key and reports the next one. The caller (the category form,
 * built in a later task) owns everything else — labeling the field, wiring
 * it into form state, and validating the result against `isCategoryIcon`.
 */
export function IconPicker({ value, onChange }: IconPickerProps) {
  const t = useTranslations("categories.iconPicker");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const SelectedIcon = CATEGORY_ICONS[isCategoryIcon(value) ? value : DEFAULT_CATEGORY_ICON];

  const entries = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return Object.entries(CATEGORY_ICONS).filter(([key]) => key.includes(needle));
  }, [search]);

  function handleSelect(key: string) {
    onChange(key);
    setOpen(false);
  }

  // Reset the filter each time the dialog opens or closes, so it never
  // reopens on a stale search from the previous session.
  function handleOpenChange(next: boolean) {
    setOpen(next);
    setSearch("");
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={<Button type="button" variant="outline" size="icon" aria-label={t("title")} />}
      >
        <SelectedIcon aria-hidden="true" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>

        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
        />

        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noResults")}</p>
        ) : (
          <div className="grid max-h-72 grid-cols-6 gap-1.5 overflow-y-auto">
            {entries.map(([key, Icon]) => (
              <Button
                key={key}
                type="button"
                variant="ghost"
                size="icon"
                aria-label={key}
                aria-pressed={key === value}
                className={cn(key === value && "bg-muted text-foreground")}
                onClick={() => handleSelect(key)}
              >
                <Icon aria-hidden="true" />
              </Button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
