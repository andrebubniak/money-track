"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { LoaderCircle, Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxClear,
  ComboboxCollection,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from "@/components/ui/combobox";
import { InputGroupAddon } from "@/components/ui/input-group";
import {
  DEFAULT_OPTIONS_DEBOUNCE_MS,
  useAsyncOptions,
  type AsyncOptionsSource,
} from "@/hooks/use-async-options";
import { cn } from "@/lib/utils";

/** The "All" entry in a filter row. A sentinel id, never a real one. */
const ALL_OPTION_ID = "";

/**
 * The shape the accessors handle for free. Anything else is still allowed —
 * it just has to say how to read its own id and label.
 */
export type ComboboxItemShape = { id: string; text: string };

type AccessorProps<TItem> = TItem extends ComboboxItemShape
  ? {
      getItemId?: (item: TItem) => string;
      itemToLabel?: (item: TItem) => string;
    }
  : {
      getItemId: (item: TItem) => string;
      itemToLabel: (item: TItem) => string;
    };

type OwnProps<TItem> = {
  value: string | null;
  onValueChange: (value: string | null) => void;
  /**
   * The item already known for `value`. An edit page passes it so the field
   * shows its current value in the first paint rather than after a round
   * trip — the same first-paint concern `.claude/rules/ui.md` documents for
   * `register()`-ed inputs.
   */
  selectedOption?: TItem | null;
  /** Shown on the trigger while nothing is selected. */
  placeholder: string;
  /** Shown in the popup's search input. Defaults to a generic "Search…". */
  searchPlaceholder?: string;
  /** When set, a leading entry mapping to `null` is offered. */
  allOptionLabel?: string;
  /** How long typing settles before a request goes out, in milliseconds. */
  debounceMs?: number;
  /** Offers an X on the trigger that clears the selection. */
  clearable?: boolean;
  /** How an item renders in the options list. Defaults to its label. */
  renderItem?: (item: TItem) => ReactNode;
  /** How the selected item renders on the trigger. Defaults to its label. */
  renderValue?: (item: TItem) => ReactNode;
  id?: string;
  invalid?: boolean;
  disabled?: boolean;
};

export type AsyncComboboxProps<TItem = ComboboxItemShape> = AsyncOptionsSource<TItem> &
  AccessorProps<TItem> &
  OwnProps<TItem>;

/**
 * One row of the list. `item === null` is the "All" entry, which has no
 * `TItem` behind it to render or read an id from.
 */
type Entry<TItem> = { id: string; item: TItem | null };

export function AsyncCombobox<TItem = ComboboxItemShape>({
  endpoint,
  fetchPage,
  queryKey,
  value,
  onValueChange,
  selectedOption = null,
  placeholder,
  searchPlaceholder,
  allOptionLabel,
  debounceMs = DEFAULT_OPTIONS_DEBOUNCE_MS,
  clearable = false,
  renderItem,
  renderValue,
  getItemId,
  itemToLabel,
  id,
  invalid,
  disabled,
}: AsyncComboboxProps<TItem>) {
  const t = useTranslations("ui.asyncCombobox");

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  /**
   * The last thing the loaded list said about `value`, kept past the request
   * that said it. A search narrows the page and the selected row is usually
   * not on the new one — without this the trigger would fall back to the
   * placeholder mid-search and read as if the value had been cleared.
   * `selectedOption` covers the other half: an item the caller already knew.
   *
   * Only ever consulted while it still describes `value`, so a value
   * arriving from anywhere else needs no invalidation — it simply won't
   * match.
   */
  const [knownEntry, setKnownEntry] = useState<Entry<TItem> | null>(null);
  /**
   * Set by the clear button, which means "no value" — distinct from the All
   * entry, which also reports `null` to the caller but is a chosen state and
   * shows its own label. Nothing else can tell the two apart, because both
   * arrive here as `value === null`.
   */
  const [cleared, setCleared] = useState(false);
  const [seenValue, setSeenValue] = useState(value);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // A value set by the caller — a form reset, an edit page loading — ends the
  // cleared state. Adjusted here rather than in an effect: an effect would
  // paint one frame with the stale answer first, and React documents this as
  // the way to reset state on a prop change.
  if (value !== seenValue) {
    setSeenValue(value);
    if (value !== null) setCleared(false);
  }

  // The fallbacks only ever run when `TItem` matched `ComboboxItemShape` —
  // that is what makes both accessors required for any other shape.
  const idOf = useCallback(
    (item: TItem) => getItemId?.(item) ?? (item as ComboboxItemShape).id,
    [getItemId],
  );
  const labelOf = useCallback(
    (item: TItem) => itemToLabel?.(item) ?? (item as ComboboxItemShape).text,
    [itemToLabel],
  );

  const { items, hasNextPage, fetchNextPage, isFetchingNextPage, isPending, isFetching, isError } =
    useAsyncOptions<TItem>({
      ...(fetchPage
        ? { fetchPage, queryKey: queryKey as readonly unknown[] }
        : { endpoint: endpoint! }),
      search,
      enabled: open,
      debounceMs,
    });

  /**
   * Memoized rather than rebuilt per render: it is handed to Base UI as the
   * current `value` whenever nothing is selected, and a fresh object every
   * render would churn the selection on the way through.
   */
  const allEntry = useMemo<Entry<TItem> | null>(
    () => (allOptionLabel ? { id: ALL_OPTION_ID, item: null } : null),
    [allOptionLabel],
  );

  // The All row is how a filter is undone, so it stays offered no matter what
  // the query matched — a search that found nothing is exactly when the way
  // back out is wanted. The empty message renders below it, not instead of it.
  const entries = useMemo<Entry<TItem>[]>(() => {
    const results = items.map((item) => ({ id: idOf(item), item }));
    return allEntry ? [allEntry, ...results] : results;
  }, [allEntry, items, idOf]);

  /** The selected value, if the page of results currently loaded holds it. */
  const loadedEntry = useMemo<Entry<TItem> | null>(() => {
    if (value === null) return null;
    const loaded = items.find((item) => idOf(item) === value);
    return loaded ? { id: value, item: loaded } : null;
  }, [value, items, idOf]);

  // Compared field by field, not by identity: the lookup above builds a new
  // object every render, so an identity check would never settle.
  if (loadedEntry && (knownEntry?.id !== loadedEntry.id || knownEntry.item !== loadedEntry.item)) {
    setKnownEntry(loadedEntry);
  }

  const currentEntry = useMemo<Entry<TItem> | null>(() => {
    if (value === null) return cleared ? null : allEntry;

    if (loadedEntry) return loadedEntry;

    // The selected item is usually not on the page currently loaded — on an
    // edit page, nothing is loaded at all until the popup opens. The trigger
    // renders straight from this entry, so it does not have to be in the
    // list for its label to show.
    if (selectedOption && idOf(selectedOption) === value) {
      return { id: value, item: selectedOption };
    }

    if (knownEntry && knownEntry.id === value) return knownEntry;

    return null;
  }, [value, cleared, allEntry, loadedEntry, selectedOption, idOf, knownEntry]);

  // Appends the next page when the sentinel row scrolls into the list.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!open || !sentinel || !hasNextPage || isFetchingNextPage) return undefined;

    const observer = new IntersectionObserver((observed) => {
      if (observed.some((entry) => entry.isIntersecting)) void fetchNextPage();
    });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [open, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const entryLabel = (entry: Entry<TItem>) =>
    entry.item === null ? (allOptionLabel ?? "") : labelOf(entry.item);

  const entryNode = (entry: Entry<TItem>, render: ((item: TItem) => ReactNode) | undefined) =>
    entry.item === null ? entryLabel(entry) : (render?.(entry.item) ?? labelOf(entry.item));

  /**
   * In the list the All row carries weight the real options don't — it is
   * the one that undoes a filter rather than applying one — so it is bold
   * there. On the trigger it is just the current value, with nothing to
   * stand out from, and stays regular.
   */
  const entryRow = (entry: Entry<TItem>) =>
    entry.item === null ? (
      <span className="font-bold">{entryLabel(entry)}</span>
    ) : (
      (renderItem?.(entry.item) ?? labelOf(entry.item))
    );

  const showClear = clearable && value !== null && !disabled;

  return (
    <Combobox<Entry<TItem>>
      items={entries}
      // Filtering happens on the server; filtering again here would hide rows
      // the endpoint deliberately returned.
      filter={null}
      value={currentEntry}
      onValueChange={(next, details) => {
        // The clear button and the All row both report `null`; only the
        // reason says which of them happened.
        setCleared(details.reason === "clear-press");
        onValueChange(next && next.id !== ALL_OPTION_ID ? next.id : null);
      }}
      onInputValueChange={setSearch}
      itemToStringLabel={entryLabel}
      isItemEqualToValue={(entry, other) => entry.id === other.id}
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        // Base UI clears the popup's input on close; mirror it, or reopening
        // shows a list filtered by a query the input no longer displays.
        if (!nextOpen) setSearch("");
      }}
      disabled={disabled}
    >
      <div className="relative w-full">
        <ComboboxTrigger
          ref={triggerRef}
          id={id}
          aria-invalid={invalid ? true : undefined}
          className={cn(
            "flex h-9 w-full items-center gap-1 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none",
            "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
            "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "lg:h-11 lg:text-base",
          )}
        >
          <ComboboxValue>
            {(entry: Entry<TItem> | null) =>
              entry ? (
                <span className="min-w-0 flex-1 truncate text-left">
                  {entryNode(entry, renderValue)}
                </span>
              ) : (
                <span className="min-w-0 flex-1 truncate text-left text-muted-foreground">
                  {placeholder}
                </span>
              )
            }
          </ComboboxValue>

          {/* Holds the clear button's width open inside the trigger's own
              flow. The button is a sibling — a button inside a button is
              invalid HTML — so it is the only thing keeping a long label from
              running underneath it, and the only thing that puts the X to the
              left of the chevron instead of padding the chevron inwards. */}
          {showClear && <span aria-hidden="true" className="w-6 shrink-0" />}
        </ComboboxTrigger>

        {showClear && (
          <ComboboxClear
            // Base UI parks it at -1 because a combobox is usually an input,
            // where emptying the box clears it. This one's field is a button,
            // so the X is the only way to unset it and has to be reachable.
            // Focus moves to the trigger because the X unmounts on its own
            // click.
            tabIndex={0}
            onClick={() => triggerRef.current?.focus()}
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={t("clear")}
                // `right-8` is where the trigger's spacer sits: the chevron
                // ends 1.75rem in (`px-3` + `size-4`), plus the row's `gap-1`.
                className="absolute inset-y-0 right-8 my-auto"
              />
            }
          />
        )}
      </div>

      <ComboboxContent>
        <ComboboxInput
          showTrigger={false}
          placeholder={searchPlaceholder ?? t("search")}
          className={cn(
            // The same box the trigger is: `ComboboxContent` insets its input
            // group by `m-1` and shrinks it to `h-8`, which leaves the search
            // field visibly narrower and shorter than the button it drops out
            // of. Important, because those rules are `*:data-[slot=…]`
            // descendant selectors and outrank a plain utility class.
            "m-0! h-9! w-full rounded-none border-x-0 border-t-0 shadow-none lg:h-11!",
            "[&_[data-slot=input-group-control]]:h-full lg:[&_[data-slot=input-group-control]]:text-base",
          )}
        >
          {/* Sits inside the field at its trailing edge, and turns into a
              spinner for as long as a request is out — the list below can be
              showing the previous search's rows the whole time, so this is
              the only thing saying a newer one is on its way. */}
          <InputGroupAddon align="inline-end">
            {isFetching ? (
              <LoaderCircle
                data-slot="async-combobox-loading-icon"
                aria-hidden="true"
                className="animate-spin"
              />
            ) : (
              <Search data-slot="async-combobox-search-icon" aria-hidden="true" />
            )}
          </InputGroupAddon>
        </ComboboxInput>

        {isError ? (
          <p className="px-2 py-3 text-sm text-destructive">{t("error")}</p>
        ) : (
          <ComboboxList
            // `ComboboxList` ships shadcn's `no-scrollbar`. A list this long
            // has to say it scrolls. The standard properties are what undo
            // it: a browser that honours `scrollbar-width` ignores the
            // `::-webkit-scrollbar` rule the utility relies on.
            className="[scrollbar-color:var(--muted-foreground)_transparent] [scrollbar-width:thin]"
          >
            <ComboboxCollection>
              {(entry: Entry<TItem>) => (
                <ComboboxItem key={entry.id} value={entry}>
                  {entryRow(entry)}
                </ComboboxItem>
              )}
            </ComboboxCollection>

            {/* Inside the list, so it only intersects once scrolled down to. */}
            {hasNextPage && (
              <div ref={sentinelRef} className="px-2 py-1.5 text-sm text-muted-foreground">
                {t("loadingMore")}
              </div>
            )}
          </ComboboxList>
        )}

        {/* Base UI's `Combobox.Empty` counts the rows it was given, and the
            always-present All row makes that count non-zero — it would never
            render. This keeps its contract by hand: one element that stays
            mounted, so a screen reader announces the swap rather than an
            insertion, with only its text changing. `empty:hidden` is what
            keeps it from taking up room while it has nothing to say. */}
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="flex w-full justify-center py-2 text-center text-sm text-muted-foreground empty:hidden"
        >
          {!isError && items.length === 0 ? (isPending || isFetching ? t("loading") : t("empty")) : null}
        </div>
      </ComboboxContent>
    </Combobox>
  );
}
