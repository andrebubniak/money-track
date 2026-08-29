"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { useLocale, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import type { ComboboxOption, OptionsResponse } from "@/lib/options";

const SEARCH_DEBOUNCE_MS = 300;

/** The "All" entry in the filter row. A sentinel id, never a real one. */
const ALL_OPTION_ID = "";

export type AsyncComboboxProps = {
  endpoint: "/api/categories/options" | "/api/cards/options";
  value: string | null;
  onValueChange: (value: string | null) => void;
  /**
   * The label already known for `value`. An edit page passes it so the field
   * shows its current value in the first paint rather than after a round
   * trip — the same first-paint concern `.claude/rules/ui.md` documents for
   * `register()`-ed inputs.
   */
  selectedOption?: ComboboxOption | null;
  placeholder: string;
  /** When set, a leading entry mapping to `null` is offered. */
  allOptionLabel?: string;
  id?: string;
  invalid?: boolean;
  disabled?: boolean;
};

export function AsyncCombobox({
  endpoint,
  value,
  onValueChange,
  selectedOption = null,
  placeholder,
  allOptionLabel,
  id,
  invalid,
  disabled,
}: AsyncComboboxProps) {
  const t = useTranslations("ui.asyncCombobox");
  // A route handler lives outside the `[locale]` segment and cannot resolve a
  // locale of its own, so the category endpoint is told which one to
  // translate preset names into. See `.claude/rules/i18n.md`.
  const locale = useLocale();

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<ComboboxOption[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  // Aborts the request a new search supersedes, so a slow page 1 cannot land
  // after the page 1 of a later query and overwrite it.
  const abortRef = useRef<AbortController | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(
    async (nextPage: number, query: string, mode: "replace" | "append") => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStatus("loading");

      try {
        const params = new URLSearchParams({
          q: query,
          page: String(nextPage),
          locale,
        });
        const response = await fetch(`${endpoint}?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Options request failed: ${response.status}`);

        const body = (await response.json()) as OptionsResponse;

        setItems((current) => (mode === "append" ? [...current, ...body.items] : body.items));
        setHasMore(body.hasMore);
        setPage(nextPage);
        setStatus("idle");
      } catch {
        if (controller.signal.aborted) return;
        setStatus("error");
      }
    },
    [endpoint, locale],
  );

  // First page on open, and a fresh first page whenever the search settles.
  // The 300ms wait is what keeps a three-letter query to one request.
  useEffect(() => {
    if (!open) return undefined;

    const timer = setTimeout(() => {
      void load(1, search, "replace");
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [open, search, load]);

  // Appends the next page when the sentinel row scrolls into the popup.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!open || !sentinel || !hasMore || status === "loading") return undefined;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void load(page + 1, search, "append");
      }
    });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [open, hasMore, status, page, search, load]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const allOption: ComboboxOption[] = allOptionLabel
    ? [{ id: ALL_OPTION_ID, name: allOptionLabel }]
    : [];

  // A preselected option may not be in the current page of results; keeping it
  // in the list is what lets Base UI render its label in the input.
  const knownOption =
    selectedOption && !items.some((item) => item.id === selectedOption.id) ? [selectedOption] : [];

  const listItems = [...allOption, ...knownOption, ...items];
  const currentValue = listItems.find((item) => item.id === (value ?? ALL_OPTION_ID)) ?? null;

  return (
    <Combobox.Root<ComboboxOption>
      items={listItems}
      // Filtering happens on the server; filtering again here would hide rows
      // the endpoint deliberately returned.
      filter={null}
      value={currentValue}
      onValueChange={(next) => onValueChange(next && next.id !== ALL_OPTION_ID ? next.id : null)}
      onInputValueChange={(next) => setSearch(next)}
      itemToStringLabel={(item) => item.name}
      isItemEqualToValue={(item, other) => item.id === other.id}
      open={open}
      onOpenChange={setOpen}
      disabled={disabled}
    >
      <Combobox.Input
        id={id}
        placeholder={placeholder}
        aria-invalid={invalid ? true : undefined}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none",
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "lg:h-11 lg:text-base",
        )}
      />

      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} className="z-50">
          <Combobox.Popup className="max-h-64 w-[var(--anchor-width)] overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
            {status === "error" ? (
              <p className="px-2 py-3 text-sm text-destructive">{t("error")}</p>
            ) : (
              <>
                <Combobox.Empty className="px-2 py-3 text-sm text-muted-foreground">
                  {status === "loading" ? t("loading") : t("empty")}
                </Combobox.Empty>

                <Combobox.List>
                  {(item: ComboboxOption) => (
                    <Combobox.Item
                      key={item.id}
                      value={item}
                      className="flex cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent"
                    >
                      {item.name}
                    </Combobox.Item>
                  )}
                </Combobox.List>

                {hasMore && (
                  <div ref={sentinelRef} className="px-2 py-1.5 text-sm text-muted-foreground">
                    {t("loadingMore")}
                  </div>
                )}
              </>
            )}
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
