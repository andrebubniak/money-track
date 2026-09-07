"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

/** The two endpoints that already speak the `?q=&page=&locale=` contract. */
export type OptionsEndpoint = "/api/categories/options" | "/api/cards/options";

/** Prefix every options query shares, so one call can invalidate all of them. */
export const ASYNC_OPTIONS_QUERY_KEY = "async-options";

export const DEFAULT_OPTIONS_DEBOUNCE_MS = 300;

export type OptionsPage<TItem> = { items: TItem[]; hasMore: boolean };

export type FetchOptionsPage<TItem> = (args: {
  page: number;
  query: string;
  signal: AbortSignal;
}) => Promise<OptionsPage<TItem>>;

/**
 * Either one of the app's own options endpoints, or an arbitrary fetcher for
 * a field whose options come from somewhere else. `queryKey` is required with
 * `fetchPage` because a closure cannot be cached by identity.
 */
export type AsyncOptionsSource<TItem> =
  | { endpoint: OptionsEndpoint; fetchPage?: never; queryKey?: never }
  | { endpoint?: never; fetchPage: FetchOptionsPage<TItem>; queryKey: readonly unknown[] };

export type UseAsyncOptionsParams<TItem> = AsyncOptionsSource<TItem> & {
  search: string;
  /** Kept `false` until the popup opens, so a closed field never fetches. */
  enabled: boolean;
  debounceMs?: number;
};

/**
 * Waits `delayMs` before reporting a new value — except for the initial one
 * and for a reset back to `""`, which pass through immediately. That is what
 * lets opening a field load its first page at once while typing still
 * collapses into a single request.
 */
function useDebouncedValue(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    if (value === debounced) return undefined;

    // A reset to "" — closing the popup, or clearing the box — takes effect
    // at once. Making the user wait out the debounce to see the unfiltered
    // list back reads as the field having hung.
    const timer = setTimeout(() => setDebounced(value), value === "" ? 0 : delayMs);
    return () => clearTimeout(timer);
  }, [value, debounced, delayMs]);

  return debounced;
}

/**
 * One page of options, paged by an offset the caller advances with
 * `fetchNextPage`. TanStack Query owns the cache, the dedupe, and the
 * cancellation of a request a newer search supersedes — the `signal` handed
 * to the fetcher is the query's own.
 */
export function useAsyncOptions<TItem>({
  endpoint,
  fetchPage,
  queryKey,
  search,
  enabled,
  debounceMs = DEFAULT_OPTIONS_DEBOUNCE_MS,
}: UseAsyncOptionsParams<TItem>) {
  // A route handler lives outside the `[locale]` segment and cannot resolve a
  // locale of its own, so it is told which one to translate preset names
  // into. See `.claude/rules/i18n.md`.
  const locale = useLocale();
  const debouncedSearch = useDebouncedValue(search, debounceMs);

  const loadPage: FetchOptionsPage<TItem> = useMemo(() => {
    if (fetchPage) return fetchPage;

    return async ({ page, query, signal }) => {
      const params = new URLSearchParams({ q: query, page: String(page), locale });
      const response = await fetch(`${endpoint}?${params}`, { signal });
      if (!response.ok) throw new Error(`Options request failed: ${response.status}`);
      return (await response.json()) as OptionsPage<TItem>;
    };
  }, [fetchPage, endpoint, locale]);

  const query = useInfiniteQuery({
    queryKey: [ASYNC_OPTIONS_QUERY_KEY, endpoint ?? queryKey, locale, debouncedSearch] as const,
    queryFn: ({ pageParam, signal }) =>
      loadPage({ page: pageParam, query: debouncedSearch, signal }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.hasMore ? allPages.length + 1 : undefined,
    enabled,
    // Every open revalidates. `useInvalidateAsyncOptions` cannot be the whole
    // answer: it reaches one `QueryClient`, and a second tab, window, or
    // restored session has its own, which never hears that a card was
    // written and would go on showing the list it loaded — until a reload,
    // which is exactly the "it only appeared after I cleared the cache"
    // report this comes from. These lists are small and only fetched when a
    // popup opens, so a request per open costs about what the field cost
    // before it had a cache at all.
    //
    // `refetchOnMount` as well as `staleTime`, so a future provider-level
    // default cannot quietly reintroduce the same bug.
    staleTime: 0,
    refetchOnMount: "always",
    // Revalidating on open stays invisible on its own — the cached pages are
    // still what renders until the response lands. This covers the other
    // half, where the key itself changes: the previous search's rows stay on
    // screen instead of the list emptying on every keystroke that settles.
    placeholderData: keepPreviousData,
  });

  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );

  return {
    items,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    /** No data for the current key yet. */
    isPending: query.isPending,
    /** A request is in flight, including one refreshing placeholder rows. */
    isFetching: query.isFetching,
    isError: query.isError,
  };
}

/**
 * Drops every cached options page. Call it after creating, editing, or
 * removing anything a dropdown lists.
 *
 * Since `useAsyncOptions` revalidates on every open, this is no longer what
 * makes a just-saved row appear — it is what updates a list that is *already
 * open*, in this tab, at the moment the row is written. Narrow, but a line at
 * each call site is all it costs.
 *
 * The prefix is deliberately the whole key root rather than one endpoint's:
 * these lists are small and refetched only when a popup opens, so the cost of
 * dropping a card page along with the categories is nothing next to the cost
 * of getting the invalidation wrong.
 */
export function useInvalidateAsyncOptions() {
  const queryClient = useQueryClient();

  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: [ASYNC_OPTIONS_QUERY_KEY] }),
    [queryClient],
  );
}
